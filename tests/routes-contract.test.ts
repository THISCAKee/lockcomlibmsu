import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LOCKCOMPUTER_CLIENT_KEY = 'test-client-key';
process.env.LOCKCOMPUTER_ADMIN_EMAILS = 'admin@msu.ac.th';
process.env.OAUTH_CLIENT_SECRET = 'test-oauth-secret';

const jsonRequest = (url: string, body?: unknown, headers?: Record<string, string>) => new Request(`http://localhost${url}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const adminCookie = async () => {
  const { signAdminCookie } = await import('../lib/server/auth-session');
  const { getServerConfig } = await import('../lib/server/config');
  return signAdminCookie('admin@msu.ac.th', new Date(Date.now() + 60_000), getServerConfig().authSecret);
};

test('health returns the configured store name', async () => {
  const { GET } = await import('../app/api/health/route');
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});

test('client poll requires both machine headers and consumes one command', async () => {
  const { POST } = await import('../app/api/client/poll/route');
  const missing = await POST(jsonRequest('/api/client/poll'));
  assert.equal(missing.status, 401);
  const valid = await POST(jsonRequest('/api/client/poll', undefined, { 'X-Machine-Id': 'PC-001', 'X-Client-Key': 'test-client-key' }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { online: true, command: null });
});

test('machines returns 201 inventory with online and lastSeenAt', async () => {
  const { GET } = await import('../app/api/machines/route');
  const response = await GET();
  const machines = await response.json();
  assert.equal(machines.length, 201);
  assert.equal(machines[0].machineId, 'PC-001');
  assert.equal(machines[0].online, true);
  assert.equal(typeof machines[0].lastSeenAt, 'string');
});

test('check-in, heartbeat, logout, and force-logout preserve status contracts', async () => {
  const { runtime } = await import('../lib/server/runtime');
  const state = await runtime();
  const token = state.clientTokens.issue('student@msu.ac.th').token;
  const { POST: checkIn } = await import('../app/api/sessions/check-in/route');
  const created = await checkIn(jsonRequest('/api/sessions/check-in', { machineId: 'PC-002' }, { authorization: `Bearer ${token}` }));
  assert.equal(created.status, 200);
  const session = await created.json();
  const { POST: heartbeat } = await import('../app/api/sessions/[id]/heartbeat/route');
  const active = await heartbeat(jsonRequest(`/api/sessions/${session.id}/heartbeat`, undefined, { authorization: `Bearer ${token}` }), { params: Promise.resolve({ id: session.id }) });
  assert.equal(active.status, 200);
  const { POST: logout } = await import('../app/api/sessions/[id]/logout/route');
  const loggedOut = await logout(jsonRequest(`/api/sessions/${session.id}/logout`, undefined, { authorization: `Bearer ${token}` }), { params: Promise.resolve({ id: session.id }) });
  assert.equal(loggedOut.status, 200);

  const secondToken = state.clientTokens.issue('other@msu.ac.th').token;
  const second = await checkIn(jsonRequest('/api/sessions/check-in', { machineId: 'PC-003' }, { authorization: `Bearer ${secondToken}` }));
  const secondSession = await second.json();
  const { POST: forceLogout } = await import('../app/api/admin/sessions/[id]/force-logout/route');
  const forced = await forceLogout(jsonRequest(`/api/admin/sessions/${secondSession.id}/force-logout`, undefined, { cookie: `lockcomputer_admin=${await adminCookie()}` }), { params: Promise.resolve({ id: secondSession.id }) });
  assert.equal(forced.status, 200);
  assert.equal((await forced.json()).status, 'ForceLoggedOut');
});

test('admin shutdown rejects unauthenticated, unknown, offline, and duplicate targets', async () => {
  const { POST } = await import('../app/api/admin/machines/[machineId]/shutdown/route');
  const cookie = await adminCookie();
  const unauthenticated = await POST(jsonRequest('/api/admin/machines/PC-004/shutdown'), { params: Promise.resolve({ machineId: 'PC-004' }) });
  assert.equal(unauthenticated.status, 403);
  const unknown = await POST(jsonRequest('/api/admin/machines/PC-999/shutdown', undefined, { cookie: `lockcomputer_admin=${cookie}` }), { params: Promise.resolve({ machineId: 'PC-999' }) });
  assert.equal(unknown.status, 404);
  const offline = await POST(jsonRequest('/api/admin/machines/PC-004/shutdown', undefined, { cookie: `lockcomputer_admin=${cookie}` }), { params: Promise.resolve({ machineId: 'PC-004' }) });
  assert.equal(offline.status, 409);
});

test('admin shutdown force-logs out active sessions and appends request and dispatch events', async () => {
  const { runtime } = await import('../lib/server/runtime');
  const state = await runtime();
  const clientToken = state.clientTokens.issue('student2@msu.ac.th').token;
  const { POST: pollClient } = await import('../app/api/client/poll/route');
  await pollClient(jsonRequest('/api/client/poll', undefined, { 'X-Machine-Id': 'PC-005', 'X-Client-Key': 'test-client-key' }));
  const { POST: checkIn } = await import('../app/api/sessions/check-in/route');
  const created = await checkIn(jsonRequest('/api/sessions/check-in', { machineId: 'PC-005' }, { authorization: `Bearer ${clientToken}` }));
  const session = await created.json();
  const { POST: shutdown } = await import('../app/api/admin/machines/[machineId]/shutdown/route');
  const response = await shutdown(jsonRequest('/api/admin/machines/PC-005/shutdown', undefined, { cookie: `lockcomputer_admin=${await adminCookie()}` }), { params: Promise.resolve({ machineId: 'PC-005' }) });
  assert.equal(response.status, 202);
  assert.equal(state.sessions.get(session.id).status, 'ForceLoggedOut');
  const { POST: poll } = await import('../app/api/client/poll/route');
  const dispatched = await poll(jsonRequest('/api/client/poll', undefined, { 'X-Machine-Id': 'PC-005', 'X-Client-Key': 'test-client-key' }));
  assert.equal((await dispatched.json()).command.type, 'shutdown');
  const events = (state.store as unknown as { eventRows: unknown[][] }).eventRows.flat().map(String);
  assert.equal(events.includes('shutdown-requested'), true);
  assert.equal(events.includes('shutdown-dispatched'), true);
});

test('monthly report JSON and CSV require Admin authorization', async () => {
  const { GET: report } = await import('../app/api/admin/reports/monthly/route');
  const { GET: csv } = await import('../app/api/admin/export/monthly.csv/route');
  const denied = await report(new Request('http://localhost/api/admin/reports/monthly?year=2026&month=9'));
  assert.equal(denied.status, 403);
  const cookie = await adminCookie();
  const allowed = await report(new Request('http://localhost/api/admin/reports/monthly?year=2026&month=9', { headers: { cookie: `lockcomputer_admin=${cookie}` } }));
  assert.equal(allowed.status, 200);
  const csvResponse = await csv(new Request('http://localhost/api/admin/export/monthly.csv?year=2026&month=9', { headers: { cookie: `lockcomputer_admin=${cookie}` } }));
  assert.equal(csvResponse.status, 200);
  assert.match(await csvResponse.text(), /month,user_email,machine_id,session_count,hours/);
});

test('OAuth login returns a redirect with both state cookies', async () => {
  const { GET } = await import('../app/auth/login/route');
  const response = await GET(new Request('http://localhost:3000/auth/login?returnUrl=/admin'));
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location') ?? '', /client_id=/);
  const cookies = response.headers.getSetCookie?.().join('\n') ?? response.headers.get('set-cookie') ?? '';
  assert.match(cookies, /lockcomputer_oauth_state=/);
  assert.match(cookies, /lockcomputer_oauth_return=/);
});
