import test from 'node:test';
import assert from 'node:assert/strict';
import { signAdminCookie, verifyAdminCookie } from '../lib/server/auth-session';

test('admin cookie rejects tampering and expired payloads', () => {
  const secret = 'test-auth-secret';
  const validUntil = new Date(Date.now() + 60_000);
  const cookie = signAdminCookie('admin@msu.ac.th', validUntil, secret);
  assert.deepEqual(verifyAdminCookie(cookie, secret), { email: 'admin@msu.ac.th', expiresAt: validUntil.toISOString() });
  assert.equal(verifyAdminCookie(`${cookie}tampered`, secret), null);
  assert.equal(verifyAdminCookie(signAdminCookie('admin@msu.ac.th', new Date(Date.now() - 1), secret), secret), null);
});
