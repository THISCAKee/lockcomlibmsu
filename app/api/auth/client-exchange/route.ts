import { runtime as getRuntime } from '../../../../lib/server/runtime';
import { isAllowedEmail } from '../../../../lib/server/oauth';
import { jsonError, readJson } from '../../../../lib/server/route-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const state = await getRuntime();
  let body: { code?: string };
  try {
    body = await readJson<{ code?: string }>(request);
  } catch {
    return jsonError('Invalid request body.', 400);
  }
  const email = body.code ? state.clientCodes.redeem(body.code) : null;
  if (!email) return jsonError('Invalid or expired login code.', 400);
  if (!isAllowedEmail(email, state.config.oauth.allowedEmailDomain)) return jsonError('Only @msu.ac.th accounts are allowed.', 403);
  return Response.json(state.clientTokens.issue(email));
}
