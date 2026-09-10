import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { InMemorySheetStore, GoogleSheetsStore } from '../lib/server/store';

const sessionRow = ['session-1', 'PC-001', 'student@msu.ac.th', '2026-09-10T08:00:00.000Z', '2026-09-10T11:00:00.000Z', 'Active', ''];
const testCredentials = () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    client_email: 'test@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
};

test('in-memory store restores valid session rows and ignores invalid rows', async () => {
  const store = new InMemorySheetStore([sessionRow, ['invalid']]);
  const sessions = await store.loadSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, 'session-1');
});

test('in-memory store restores and appends Admin rows', async () => {
  const store = new InMemorySheetStore([], [], [['staff@msu.ac.th', 'admin', 'Active', 'khunanon.m@msu.ac.th', '2026-09-10T08:00:00.000Z']]);
  const admins = await store.loadAdmins();
  assert.equal(admins[0].email, 'staff@msu.ac.th');
  await store.appendAdmin(['second@msu.ac.th', 'admin', 'Active', 'khunanon.m@msu.ac.th', '2026-09-10T08:00:00.000Z']);
  assert.equal(store.adminRows.length, 2);
});

test('Google Sheets store reads and appends Admin rows in Admins!A:E', async () => {
  const calls: Request[] = [];
  const store = new GoogleSheetsStore({
    spreadsheetId: 'sheet-id',
    credentialsFile: 'unused-in-test',
    sessionsRange: 'Sessions!A:H',
    eventsRange: 'Events!A:F',
  }, async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    if (request.url.endsWith('/token')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
    if (request.url.includes('Admins!A%3AE')) return Response.json({ values: [['staff@msu.ac.th', 'admin', 'Active', 'khunanon.m@msu.ac.th', '2026-09-10T08:00:00.000Z']] });
    return new Response(null, { status: 200 });
  }, testCredentials());
  const admins = await store.loadAdmins();
  assert.equal(admins[0].email, 'staff@msu.ac.th');
  await store.appendAdmin(['second@msu.ac.th', 'admin', 'Active', 'khunanon.m@msu.ac.th', '2026-09-10T08:00:00.000Z']);
  assert.equal(calls.filter(request => request.method === 'POST' && !request.url.endsWith('/token')).length, 1);
  assert.match(calls.at(-1)?.url ?? '', /Admins!A%3AE:append/);
});

test('Google Sheets store loads Sessions!A:H with a bearer token', async () => {
  const calls: Request[] = [];
  const store = new GoogleSheetsStore({
    spreadsheetId: 'sheet-id',
    credentialsFile: 'unused-in-test',
    sessionsRange: 'Sessions!A:H',
    eventsRange: 'Events!A:F',
  }, async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    calls.push(request);
    if (request.url.endsWith('/token')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
    return Response.json({ values: [sessionRow] });
  }, testCredentials());
  const sessions = await store.loadSessions();
  assert.equal(sessions[0].machineId, 'PC-001');
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[1].headers.get('authorization'), 'Bearer test-token');
  assert.match(calls[1].url, /Sessions!A%3AH/);
});

test('Google Sheets store appends lifecycle rows serially', async () => {
  const requests: Request[] = [];
  const store = new GoogleSheetsStore({
    spreadsheetId: 'sheet-id',
    credentialsFile: 'unused-in-test',
    sessionsRange: 'Sessions!A:H',
    eventsRange: 'Events!A:F',
  }, async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    requests.push(request);
    if (request.url.endsWith('/token')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
    return new Response(null, { status: 200 });
  }, testCredentials());
  await Promise.all([store.appendSession(sessionRow), store.appendEvent(['now', 'id', 'PC-001', 'admin@msu.ac.th', 'check-in', ''])]);
  const writes = requests.filter(request => request.method === 'POST' && !request.url.endsWith('/token'));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].headers.get('authorization'), 'Bearer test-token');
});

test('Google Sheets errors are surfaced without returning a successful write', async () => {
  const store = new GoogleSheetsStore({
    spreadsheetId: 'sheet-id',
    credentialsFile: 'unused-in-test',
    sessionsRange: 'Sessions!A:H',
    eventsRange: 'Events!A:F',
  }, async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
    if (request.url.endsWith('/token')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
    return new Response('private response body', { status: 500 });
  }, testCredentials());
  await assert.rejects(store.appendEvent(['event']), error => {
    assert.match(String(error), /Google Sheets request failed/);
    assert.doesNotMatch(String(error), /private response body/);
    return true;
  });
});
