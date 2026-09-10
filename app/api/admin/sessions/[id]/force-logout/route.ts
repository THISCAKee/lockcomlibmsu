import { runtime as getRuntime } from '../../../../../../lib/server/runtime';
import { adminEmail, jsonError } from '../../../../../../lib/server/route-auth';
import { SessionNotFoundError } from '../../../../../../lib/server/session-manager';
import { eventRow, sessionRow, sessionView } from '../../../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const state = await getRuntime();
  const admin = adminEmail(request, state);
  if (!admin) return jsonError('Forbidden.', 403);
  const { id } = await context.params;

  try {
    const session = state.sessions.get(id);
    state.sessions.forceLogout(id);
    const updated = state.sessions.get(id);
    await state.store.appendSession(sessionRow(updated, 'updated'));
    await state.store.appendEvent(eventRow(id, session.machineId, admin, 'force-logout'));
    return Response.json(sessionView(updated));
  } catch (error) {
    if (error instanceof SessionNotFoundError) return jsonError(error.message, 404);
    throw error;
  }
}
