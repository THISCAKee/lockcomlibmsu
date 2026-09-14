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

test('PM2 exposes Next.js only through loopback port 3001', () => {
  const config = read('./ecosystem.config.cjs');
  assert.match(config, /name:\s*['"]lockcomputer['"]/);
  assert.match(config, /script:\s*['"]node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next['"]/);
  assert.match(config, /args:\s*['"]start -H 127\.0\.0\.1 -p 3001['"]/);
  assert.match(config, /exec_mode:\s*['"]fork['"]/);
  assert.match(config, /cwd:\s*__dirname/);
  assert.match(config, /NODE_ENV:\s*['"]production['"]/);
});

test('IIS proxies only the comlibmsu application to the loopback Next.js path', () => {
  const config = read('./web.config');
  assert.match(config, /<match url="\(\.\*\)" \/>/);
  assert.match(config, /https:\/\/smartlib\.msu\.ac\.th\/comlibmsu\/{R:1}/);
  assert.match(config, /url="http:\/\/127\.0\.0\.1:3001\/comlibmsu\/{R:1}"/);
  assert.match(config, /HTTP_X_FORWARDED_PROTO/);
  assert.match(config, /appendQueryString="true"/);
  assert.match(config, /stopProcessing="true"/);
  assert.doesNotMatch(config, /etraining|localhost:3000/);
});

test('repository ignores environment files and service-account credentials', () => {
  const ignore = read('./.gitignore');
  for (const pattern of ['.env*', 'node_modules/', '.next/', 'service-account', '*.pem']) {
    assert.match(ignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
