import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');

test('production startup validates secrets and starts the built Next.js server', () => {
  const script = read('./scripts/start-production.ps1');
  for (const name of ['LOCKCOMPUTER_AUTH_SECRET', 'LOCKCOMPUTER_CLIENT_KEY', 'GOOGLE_SHEETS_CREDENTIALS_FILE', 'OAUTH_REDIRECT_URI']) {
    assert.match(script, new RegExp(name.replaceAll('_', '\\_')));
  }
  assert.match(script, /npm run start/);
  assert.match(script, /next build|\.next/);
  assert.match(script, /https:\/\//);
});

test('Windows service setup uses an explicit service account and app directory', () => {
  const script = read('./scripts/install-next-service.ps1');
  assert.match(script, /New-Service/);
  assert.match(script, /Credential/);
  assert.match(script, /Working|AppRoot|Set-Location/);
  assert.match(script, /https:\/\//);
});

test('repository ignores environment files and service-account credentials', () => {
  const ignore = read('./.gitignore');
  for (const pattern of ['.env*', 'node_modules/', '.next/', 'service-account', '*.pem']) {
    assert.match(ignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
