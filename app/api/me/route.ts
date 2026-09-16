import { runtime as getRuntime } from '../../../lib/server/runtime';
import { adminEmail } from '../../../lib/server/route-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  await state.refreshAdmins();
  const email = adminEmail(request, state);
  return email ? Response.json({ email, role: 'admin' }) : Response.json(null, { status: 401 });
}
