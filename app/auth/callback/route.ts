import { runtime as getRuntime } from '../../../lib/server/runtime';
import { exchangeCodeForEmail, isAllowedEmail } from '../../../lib/server/oauth';
import { isAdminOAuthReturn, normalizeOAuthReturn } from '../../../lib/server/oauth-return';
import { signAdminCookie } from '../../../lib/server/auth-session';
import { clearCookie, isSecureRequest, redirectResponse, setCookie } from '../../../lib/server/http';
import { cookieValue, jsonError } from '../../../lib/server/route-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const state = await getRuntime();
  const url = new URL(request.url);
  const expectedState = cookieValue(request, 'lockcomputer_oauth_state');
  if (!expectedState || expectedState !== url.searchParams.get('state')) return jsonError('Invalid OAuth state.', 400);

  const code = url.searchParams.get('code');
  if (!code) return jsonError('OAuth callback did not include an authorization code.', 400);
  const secure = isSecureRequest(request);
  const returnUrl = normalizeOAuthReturn(cookieValue(request, 'lockcomputer_oauth_return') ?? null);
  const clearAuthCookies = (response: Response) => {
    response.headers.append('set-cookie', clearCookie('lockcomputer_oauth_state', secure));
    response.headers.append('set-cookie', clearCookie('lockcomputer_oauth_return', secure));
    return response;
  };

  try {
    const email = await exchangeCodeForEmail(state.config.oauth, code, request.signal);
    if (!isAllowedEmail(email, state.config.oauth.allowedEmailDomain)) {
      return clearAuthCookies(jsonError('Only @msu.ac.th accounts are allowed.', 403));
    }

    if (isAdminOAuthReturn(returnUrl)) {
      if (!state.admins.isAdmin(email)) return clearAuthCookies(jsonError('This account is not an Admin.', 403));
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const response = redirectResponse(`${state.config.adminWebUrl.replace(/\/$/, '')}${returnUrl}`);
      response.headers.append('set-cookie', setCookie('lockcomputer_admin', signAdminCookie(email, expiresAt, state.config.authSecret), { maxAge: 12 * 60 * 60, secure }));
      return clearAuthCookies(response);
    }

    const clientCode = state.clientCodes.issue(email);
    const response = redirectResponse(`lockcomputer://login?code=${encodeURIComponent(clientCode)}`);
    return clearAuthCookies(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth sign-in failed.';
    return clearAuthCookies(jsonError(message, 502));
  }
}
