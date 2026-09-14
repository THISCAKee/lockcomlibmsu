import { randomBytes } from 'node:crypto';
import { normalizeOAuthReturn } from '../../../lib/server/oauth-return';
import { runtime as getRuntime } from '../../../lib/server/runtime';
import { createAuthorizationUrl } from '../../../lib/server/oauth';
import { browserNavigationResponse, isSecureRequest, setCookie } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  const url = new URL(request.url);
  const returnUrl = normalizeOAuthReturn(url.searchParams.get('returnUrl'));
  const oauthState = randomBytes(16).toString('hex');
  const secure = isSecureRequest(request);
  const response = browserNavigationResponse(createAuthorizationUrl(state.config.oauth, oauthState, returnUrl));
  response.headers.append('set-cookie', setCookie('lockcomputer_oauth_state', oauthState, { maxAge: 600, secure }));
  response.headers.append('set-cookie', setCookie('lockcomputer_oauth_return', returnUrl, { maxAge: 600, secure }));
  return response;
}
