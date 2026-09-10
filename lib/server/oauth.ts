import type { OAuthConfig } from './types';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createAuthorizationUrl(config: OAuthConfig, state: string, returnUrl: string) {
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  if (config.allowedEmailDomain) query.set('hd', config.allowedEmailDomain.replace(/^@/, ''));
  query.set('returnUrl', returnUrl);
  return `${config.authorizationUrl}${config.authorizationUrl.includes('?') ? '&' : '?'}${query.toString()}`;
}

export async function exchangeCodeForEmail(config: OAuthConfig, code: string, signal?: AbortSignal, fetchImpl: FetchLike = fetch) {
  const tokenResponse = await fetchImpl(config.tokenUrl, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!tokenResponse.ok) {
    const reason = await safeProviderReason(tokenResponse);
    throw new Error(`OAuth token request failed (${tokenResponse.status}): ${reason}`);
  }

  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error('OAuth token response was empty.');
  const userResponse = await fetchImpl(config.userInfoUrl, {
    signal,
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) throw new Error(`OAuth user info request failed (${userResponse.status}).`);
  const user = await userResponse.json() as { email?: string };
  if (!user.email) throw new Error('OAuth account did not provide an email.');
  return user.email;
}

export function isAllowedEmail(email: string | null | undefined, allowedDomain: string | null | undefined) {
  if (!email?.trim() || !allowedDomain?.trim()) return false;
  const normalizedEmail = email.trim();
  const normalizedDomain = allowedDomain.trim().replace(/^@/, '');
  const firstAt = normalizedEmail.indexOf('@');
  const lastAt = normalizedEmail.lastIndexOf('@');
  return firstAt > 0 && firstAt === lastAt && normalizedEmail.slice(firstAt + 1).toLowerCase() === normalizedDomain.toLowerCase();
}

async function safeProviderReason(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string };
    return [parsed.error, parsed.error_description].filter(Boolean).join(': ') || 'OAuth provider rejected the token request.';
  } catch {
    return 'OAuth provider rejected the token request.';
  }
}
