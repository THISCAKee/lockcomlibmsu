import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthorizationUrl, exchangeCodeForEmail, isAllowedEmail } from '../lib/server/oauth';
import type { OAuthConfig } from '../lib/server/types';

const config: OAuthConfig = {
  authorizationUrl: 'https://provider.example/auth',
  tokenUrl: 'https://provider.example/token',
  userInfoUrl: 'https://provider.example/userinfo',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3000/auth/callback',
  scope: 'openid email profile',
  allowedEmailDomain: 'msu.ac.th',
};

test('authorization URL includes select_account and the allowed hosted domain', () => {
  const url = new URL(createAuthorizationUrl(config, 'state-value', '/client'));
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(url.searchParams.get('hd'), 'msu.ac.th');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
});

test('OAuth exchange sends client secret only to the configured token endpoint', async () => {
  const calls: Request[] = [];
  const email = await exchangeCodeForEmail(config, 'auth-code', undefined, async (input, init) => {
    const request = new Request(input, init);
    calls.push(request);
    if (request.url === config.tokenUrl) return Response.json({ access_token: 'access-token' });
    return Response.json({ email: 'student@msu.ac.th' });
  });
  assert.equal(email, 'student@msu.ac.th');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, config.tokenUrl);
  assert.match(await calls[0].text(), /client_secret=client-secret/);
  assert.equal(calls[1].headers.get('authorization'), 'Bearer access-token');
});

test('provider error exposes safe error and not response secrets', async () => {
  await assert.rejects(
    exchangeCodeForEmail(config, 'auth-code', undefined, async () => new Response(JSON.stringify({ error: 'invalid_client', error_description: 'The OAuth client was not found.', private_key: 'must-not-leak' }), { status: 400 })),
    error => {
      assert.match(String(error), /invalid_client/);
      assert.match(String(error), /The OAuth client was not found/);
      assert.doesNotMatch(String(error), /must-not-leak/);
      return true;
    },
  );
});

test('email policy accepts exactly one @msu.ac.th suffix', () => {
  assert.equal(isAllowedEmail('student@msu.ac.th', 'msu.ac.th'), true);
  assert.equal(isAllowedEmail('student@other.ac.th', 'msu.ac.th'), false);
  assert.equal(isAllowedEmail('student@msu.ac.th@other.ac.th', 'msu.ac.th'), false);
});
