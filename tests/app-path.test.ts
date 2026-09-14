import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_BASE_PATH, appPath } from '../lib/app-path';

test('application paths are rooted below the Smartlib subpath exactly once', () => {
  assert.equal(APP_BASE_PATH, '/comlibmsu');
  assert.equal(appPath('/admin'), '/comlibmsu/admin');
  assert.equal(appPath('/api/me'), '/comlibmsu/api/me');
  assert.equal(appPath('/api/me?refresh=1'), '/comlibmsu/api/me?refresh=1');
  assert.equal(appPath('/comlibmsu/admin'), '/comlibmsu/admin');
});

test('Next.js declares the same base path', () => {
  const config = fs.readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /basePath:\s*['"]\/comlibmsu['"]/);
});
