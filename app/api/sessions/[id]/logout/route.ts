import { runtime as getRuntime } from '../../../../../lib/server/runtime';
import { clientEmail, jsonError } from '../../../../../lib/server/route-auth';
import { SessionNotFoundError } from '../../../../../lib/server/session-manager';
import { eventRow, sessionRow, sessionView } from '../../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const state = await getRuntime();
  const email = clientEmail(request, state);
  if (!email) return jsonError('Unauthorized.', 401);
  const { id } = await context.params;

  try {
    const session = state.sessions.get(id);
    if (session.userEmail.toLowerCase() !== email.toLowerCase()) return jsonError('Forbidden.', 403);
    state.sessions.logout(id);
    const updated = state.sessions.get(id);
    await state.store.appendSession(sessionRow(updated, 'updated'));
    await state.store.appendEvent(eventRow(id, updated.machineId, email, 'logout'));
    return Response.json(sessionView(updated));
  } catch (error) {
    if (error instanceof SessionNotFoundError) return jsonError(error.message, 404);
    throw error;
  }
}
