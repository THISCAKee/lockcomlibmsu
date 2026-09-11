import { runtime as getRuntime } from '../../../../../lib/server/runtime';
import { adminEmail, jsonError } from '../../../../../lib/server/route-auth';
import { MonthlyReportBuilder } from '../../../../../lib/server/monthly-report';
import { validMonth } from '../../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  if (!adminEmail(request, state)) return jsonError('Forbidden.', 403);
  const url = new URL(request.url);
  const now = new Date();
  const year = url.searchParams.get('year') ?? String(now.getUTCFullYear());
  const month = url.searchParams.get('month') ?? String(now.getUTCMonth() + 1);
  const selected = validMonth(`${year.padStart(4, '0')}-${month.padStart(2, '0')}`);
  if (!selected) return jsonError('Invalid year or month.', 400);
  const sessions = await state.store.loadSessions();
  return Response.json(MonthlyReportBuilder.build(sessions, selected));
}
