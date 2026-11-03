import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { isKnownMachine } from '../../../../lib/server/config';
import { readJson, clientEmail, jsonError } from '../../../../lib/server/route-auth';
import { SessionConflictError } from '../../../../lib/server/session-manager';
import { eventRow, sessionView } from '../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckInBody = { machineId?: string };

export async function POST(request: Request) {
  const state = await getRuntime();
  const email = clientEmail(request, state);
  if (!email) return jsonError('Unauthorized.', 401);

  let body: CheckInBody;
  try {
    body = await readJson<CheckInBody>(request);
  } catch {
    return jsonError('Invalid request body.', 400);
  }

  const machineId = body.machineId?.trim() ?? '';
  if (!isKnownMachine(machineId, state.config)) return jsonError('Machine was not found.', 404);

  try {
    const session = await state.zoneCheckIn.checkIn(machineId, email);
    await state.store.appendEvent(eventRow(session.id, session.machineId, session.userEmail, 'check-in')).catch(() => undefined);
    return Response.json(sessionView(session));
  } catch (error) {
    if (error instanceof SessionConflictError) return jsonError(error.message, 409);
    if (error instanceof TypeError) return jsonError(error.message, 400);
    throw error;
  }
}
