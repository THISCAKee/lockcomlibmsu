import { runtime as getRuntime } from '../../../lib/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await getRuntime();
  await state.refreshSessions();
  const zones = await state.zoneCheckIn.loadZones();
  const active = new Map(state.sessions.listSessions().filter(session => session.status === 'Active').map(session => [session.machineId.toLowerCase(), session]));
  const machines = Array.from({ length: state.config.machineCount }, (_, index) => {
    const machineId = `${state.config.machinePrefix}${String(index + 1).padStart(3, '0')}`;
    const session = active.get(machineId.toLowerCase());
    const zone = zones.find(candidate => candidate.machines.includes(machineId));
    const presence = state.presence.getSnapshot(machineId);
    return {
      machineId,
      name: machineId,
      zone: zone?.name ?? 'ไม่ระบุ',
      dailyLimit: zone?.dailyLimit ?? null,
      status: session ? 'InUse' : 'Available',
      userEmail: session?.userEmail,
      startedAt: session?.startedAt,
      expiresAt: session?.expiresAt,
      sessionId: session?.id,
      online: presence.online,
      lastSeenAt: presence.lastSeenAt,
    };
  });
  return Response.json(machines);
}
