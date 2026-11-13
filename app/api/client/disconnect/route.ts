import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { clientMachine, jsonError, readJson } from '../../../../lib/server/route-auth';
import { SessionNotFoundError } from '../../../../lib/server/session-manager';
import { sessionRow } from '../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DisconnectBody = { sessionId?: unknown; reason?: unknown; occurredAt?: unknown };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Client reports that it returned a user to the login screen on its own
 * (it could not reach the server for too long). The report is usually sent after the
 * network comes back, so the session is ended at the time the Client gave up.
 */
export async function POST(request: Request) {
  const state = await getRuntime();
  const machineId = clientMachine(request, state);
  if (!machineId) return jsonError('Unauthorized.', 401);

  let body: DisconnectBody;
  try {
    body = await readJson<DisconnectBody>(request);
  } catch {
    return jsonError('Invalid request body.', 400);
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const reason = typeof body.reason === 'string' && /^[a-z-]{1,40}$/.test(body.reason) ? body.reason : 'unknown';
  if (!sessionId) return jsonError('sessionId is required.', 400);

  const now = state.clock.now();
  const reported = typeof body.occurredAt === 'string' ? Date.parse(body.occurredAt) : NaN;
  const occurredAt = Number.isFinite(reported) && reported <= now.getTime() && reported >= now.getTime() - DAY_MS
    ? new Date(reported)
    : now;

  await state.refreshSessions();
  let ended = false;
  let userEmail = '';
  try {
    const session = state.sessions.get(sessionId);
    if (session.machineId.toLowerCase() !== machineId.toLowerCase()) return jsonError('Forbidden.', 403);
    // Already ended (logout, force-logout, expiry, or a repeated report): nothing to record.
    if (session.status !== 'Active') return Response.json({ ended: false });
    state.sessions.logout(sessionId, occurredAt);
    await state.store.appendSession(sessionRow(state.sessions.get(sessionId), 'updated'));
    ended = true;
    userEmail = session.userEmail;
  } catch (error) {
    if (!(error instanceof SessionNotFoundError)) throw error;
  }

  // The user pressed "sign out" while the server was unreachable: record it as their own logout.
  const event = reason === 'logout-unreachable' && userEmail
    ? [occurredAt.toISOString(), sessionId, machineId, userEmail, 'logout', 'offline']
    : [occurredAt.toISOString(), sessionId, machineId, '', 'client-disconnected', reason];
  await state.store.appendEvent(event);
  return Response.json({ ended });
}
