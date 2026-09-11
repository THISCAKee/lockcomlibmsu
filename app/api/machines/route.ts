import { runtime as getRuntime } from '../../../lib/server/runtime';
import { zoneForMachine } from '../../../lib/server/zones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await getRuntime();
  const active = new Map(state.sessions.listSessions().filter(session => session.status === 'Active').map(session => [session.machineId.toLowerCase(), session]));
  const machines = Array.from({ length: state.config.machineCount }, (_, index) => {
    const machineId = `${state.config.machinePrefix}${String(index + 1).padStart(3, '0')}`;
    const session = active.get(machineId.toLowerCase());
    const presence = state.presence.getSnapshot(machineId);
    return {
      machineId,
      name: machineId,
      zone: zoneForMachine(machineId) ?? 'ไม่ระบุ',
      status: session ? 'InUse' : 'Available',
      userEmail: session?.userEmail,
      expiresAt: session?.expiresAt,
      sessionId: session?.id,
      online: presence.online,
      lastSeenAt: presence.lastSeenAt,
    };
  });
  return Response.json(machines);
}
