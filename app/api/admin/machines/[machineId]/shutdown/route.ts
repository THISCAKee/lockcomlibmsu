import { randomUUID } from 'node:crypto';
import { runtime as getRuntime } from '../../../../../../lib/server/runtime';
import { isKnownMachine } from '../../../../../../lib/server/config';
import { adminEmail, jsonError } from '../../../../../../lib/server/route-auth';
import { eventRow, sessionRow } from '../../../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ machineId: string }> }) {
  const state = await getRuntime();
  await state.refreshAdmins();
  await state.refreshSessions();
  const admin = adminEmail(request, state);
  if (!admin) return jsonError('Forbidden.', 403);

  const { machineId: rawMachineId } = await context.params;
  const machineId = rawMachineId.trim();
  if (!isKnownMachine(machineId, state.config)) return jsonError('Machine was not found.', 404);
  if (!state.presence.canQueueShutdown(machineId)) return jsonError('Machine is offline or already has a pending shutdown command.', 409);

  const active = state.sessions.getActiveForMachine(machineId);
  if (active) {
    state.sessions.forceLogout(active.id);
    const updated = state.sessions.get(active.id);
    await state.store.appendSession(sessionRow(updated, 'updated'));
    await state.store.appendEvent(eventRow(active.id, machineId, admin, 'force-logout', 'remote-shutdown'));
  }

  const commandId = randomUUID().replaceAll('-', '');
  await state.store.appendEvent(eventRow(commandId, machineId, admin, 'shutdown-requested', 'remote-admin'));
  const command = state.presence.tryQueueShutdown(machineId, commandId);
  if (!command) return jsonError('Machine is offline or already has a pending shutdown command.', 409);
  return Response.json({ commandId: command.id, machineId, type: command.type }, { status: 202 });
}
