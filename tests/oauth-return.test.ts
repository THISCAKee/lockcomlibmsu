import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminOAuthReturn, normalizeOAuthReturn } from '../lib/server/oauth-return';

test('OAuth return targets preserve approved Admin pages and reject open redirects', () => {
  assert.equal(normalizeOAuthReturn('/admin'), '/admin');
  assert.equal(normalizeOAuthReturn('/admin/usage'), '/admin/usage');
  assert.equal(normalizeOAuthReturn('/client'), '/client');
  assert.equal(normalizeOAuthReturn('https://evil.example'), '/client');
  assert.equal(normalizeOAuthReturn('//evil.example'), '/client');
  assert.equal(isAdminOAuthReturn('/admin'), true);
  assert.equal(isAdminOAuthReturn('/admin/usage'), true);
  assert.equal(isAdminOAuthReturn('/client'), false);
});
