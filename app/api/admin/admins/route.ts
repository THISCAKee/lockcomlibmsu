import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { adminEmail, jsonError, readJson } from '../../../../lib/server/route-auth';
import { AdminConflictError, AdminPermissionError } from '../../../../lib/server/admin-registry';
import { eventRow } from '../../../../lib/server/route-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  const admin = adminEmail(request, state);
  if (!admin) return jsonError('Forbidden.', 403);
  return Response.json({ admins: state.admins.list(), canManage: state.admins.canManage(admin) });
}

export async function POST(request: Request) {
  const state = await getRuntime();
  const admin = adminEmail(request, state);
  if (!admin || !state.admins.canManage(admin)) return jsonError('Forbidden.', 403);

  let body: { email?: string };
  try {
    body = await readJson<{ email?: string }>(request);
  } catch {
    return jsonError('Invalid request body.', 400);
  }

  try {
    const record = state.admins.add(body.email ?? '', admin);
    await state.store.appendAdmin([record.email, record.role, record.status, record.addedBy, record.addedAt]);
    await state.store.appendEvent(eventRow('', '', admin, 'admin-added', record.email));
    return Response.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof AdminPermissionError) return jsonError(error.message, 403);
    if (error instanceof AdminConflictError) return jsonError(error.message, 409);
    if (error instanceof TypeError) return jsonError(error.message, 400);
    throw error;
  }
}
