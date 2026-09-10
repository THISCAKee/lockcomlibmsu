import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { isKnownMachine } from '../../../../lib/server/config';
import { jsonError } from '../../../../lib/server/route-auth';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const state = await getRuntime();
  const machineId = request.headers.get('X-Machine-Id')?.trim() ?? '';
  const clientKey = request.headers.get('X-Client-Key') ?? '';
  if (!isKnownMachine(machineId, state.config) || !validClientKey(state.config.clientKey, clientKey)) return jsonError('Unauthorized.', 401);
  const result = state.presence.poll(machineId);
  let command = null;
  if (result.command) {
    await state.store.appendEvent([new Date().toISOString(), result.command.id, machineId, '', 'shutdown-dispatched', 'remote-admin']);
    command = { id: result.command.id, type: result.command.type };
  }
  return Response.json({ online: result.online, command });
}

function validClientKey(expected: string, provided: string) {
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
