import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { adminEmail, jsonError } from '../../../../lib/server/route-auth';
import { buildActivityLog, isValidDay } from '../../../../lib/server/activity-log';
import { bangkokDay } from '../../../../lib/server/zone-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  if (!adminEmail(request, state)) return jsonError('Forbidden.', 403);
  const url = new URL(request.url);
  const now = state.clock.now();
  const day = url.searchParams.get('date') || bangkokDay(now);
  if (!isValidDay(day)) return jsonError('Invalid date.', 400);
  const email = url.searchParams.get('email')?.trim() || undefined;
  const [events, sessions] = await Promise.all([state.store.loadEvents(), state.store.loadSessions()]);
  return Response.json({ date: day, entries: buildActivityLog(events, sessions, day, now, email) });
}
