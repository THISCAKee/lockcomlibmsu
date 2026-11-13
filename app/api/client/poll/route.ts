import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { clientMachine, jsonError } from '../../../../lib/server/route-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const state = await getRuntime();
  const machineId = clientMachine(request, state);
  if (!machineId) return jsonError('Unauthorized.', 401);
  const result = state.presence.poll(machineId);
  let command = null;
  if (result.command) {
    const eventType = result.command.type === 'close' ? 'close-dispatched' : 'shutdown-dispatched';
    await state.store.appendEvent([new Date().toISOString(), result.command.id, machineId, '', eventType, 'remote-admin']);
    command = { id: result.command.id, type: result.command.type };
  }
  return Response.json({ online: result.online, command });
}
