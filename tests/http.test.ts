import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCookie, isSecureRequest, setCookie } from '../lib/server/http';

test('LockComputer cookies are scoped to the Smartlib application', () => {
  assert.match(setCookie('test', 'value', { maxAge: 60, secure: true }), /Path=\/comlibmsu/);
  assert.match(clearCookie('test', true), /Path=\/comlibmsu/);
});

test('HTTPS is recognized through the trusted IIS forwarding header', () => {
  assert.equal(isSecureRequest(new Request('http://127.0.0.1/test', { headers: { 'x-forwarded-proto': 'https' } })), true);
  assert.equal(isSecureRequest(new Request('https://smartlib.msu.ac.th/test')), true);
  assert.equal(isSecureRequest(new Request('http://127.0.0.1/test')), false);
});
