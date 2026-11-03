import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { adminEmail, jsonError, readJson } from '../../../../lib/server/route-auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const state = await getRuntime();
  await state.refreshAdmins();
  if (!adminEmail(request, state)) return jsonError('Forbidden.', 403);
  return Response.json({ zones: await state.zoneCheckIn.loadZones(), machineCount: state.config.machineCount });
}
export async function PUT(request: Request) {
  const state = await getRuntime();
  await state.refreshAdmins();
  if (!adminEmail(request, state)) return jsonError('Forbidden.', 403);
  try {
    const body = await readJson<{ zones: unknown }>(request);
    return Response.json({ zones: await state.zoneCheckIn.saveZones(body.zones) });
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) return jsonError(error.message, 400);
    throw error;
  }
}
