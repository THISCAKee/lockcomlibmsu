import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { adminEmail, jsonError, readJson } from '../../../../lib/server/route-auth';
import { isAllowedEmail } from '../../../../lib/server/oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const state = await getRuntime();
  await state.refreshAdmins();
  if (!adminEmail(request, state)) return jsonError('Forbidden.', 403);
  let body: { email?: unknown };
  try { body = await readJson(request); } catch { return jsonError('Invalid request.', 400); }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isAllowedEmail(email, state.config.oauth.allowedEmailDomain)) return jsonError('กรุณาระบุอีเมล @msu.ac.th ให้ถูกต้อง', 400);
  return Response.json({ email, zones: await state.zoneCheckIn.usageForEmail(email) });
}
