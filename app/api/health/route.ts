import { runtime as getRuntime } from '../../../lib/server/runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await getRuntime();
  return Response.json({ status: 'ok', store: state.store.name, utc: new Date().toISOString() });
}
