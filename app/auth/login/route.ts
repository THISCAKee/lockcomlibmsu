import { randomBytes } from 'node:crypto';
import { runtime as getRuntime } from '../../../lib/server/runtime';
import { createAuthorizationUrl } from '../../../lib/server/oauth';
import { redirectResponse, setCookie } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  const url = new URL(request.url);
  const requestedReturnUrl = url.searchParams.get('returnUrl') ?? '/client';
  const returnUrl = requestedReturnUrl === '/admin' || requestedReturnUrl === '/client' ? requestedReturnUrl : '/client';
  const oauthState = randomBytes(16).toString('hex');
  const secure = url.protocol === 'https:';
  const response = redirectResponse(createAuthorizationUrl(state.config.oauth, oauthState, returnUrl));
  response.headers.append('set-cookie', setCookie('lockcomputer_oauth_state', oauthState, { maxAge: 600, secure }));
  response.headers.append('set-cookie', setCookie('lockcomputer_oauth_return', returnUrl, { maxAge: 600, secure }));
  return response;
}
