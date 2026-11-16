import { runtime as getRuntime } from '../../../../../lib/server/runtime';
import { clientEmail, jsonError } from '../../../../../lib/server/route-auth';
import { SessionNotFoundError } from '../../../../../lib/server/session-manager';
import { sessionView } from '../../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const state = await getRuntime();
  const email = clientEmail(request, state);
  if (!email) return jsonError('Unauthorized.', 401);
  const { id } = await context.params;

  try {
    let session;
    try {
      session = state.sessions.get(id);
    } catch (error) {
      if (!(error instanceof SessionNotFoundError)) throw error;
      // Never end a user's session over a stale in-memory copy: check the sheet once first.
      await state.refreshSessions();
      session = state.sessions.get(id);
    }
    if (session.userEmail.toLowerCase() !== email.toLowerCase()) return jsonError('Forbidden.', 403);
    state.sessions.reconcileExpiredSessions();
    if (session.status === 'Active') state.sessions.touch(id);
    return session.status === 'Active'
      ? Response.json(sessionView(session))
      : jsonError('Session is no longer active.', 409);
  } catch (error) {
    if (error instanceof SessionNotFoundError) return jsonError(error.message, 404);
    throw error;
  }
}
