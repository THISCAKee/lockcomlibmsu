import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientTokenStore, OneTimeClientCodeStore } from '../lib/server/client-tokens';

test('one-time Client code can be redeemed only once', () => {
  const clock = { now: () => new Date('2026-09-10T08:00:00.000Z') };
  const store = new OneTimeClientCodeStore(clock, 120_000);
  const code = store.issue('student@msu.ac.th');
  assert.equal(store.redeem(code), 'student@msu.ac.th');
  assert.equal(store.redeem(code), null);
  const expired = store.issue('student@msu.ac.th');
  clock.now = () => new Date('2026-09-10T08:03:00.000Z');
  assert.equal(store.redeem(expired), null);
});

test('Client bearer tokens expire and are not logged', () => {
  const clock = { now: () => new Date('2026-09-10T08:00:00.000Z') };
  const store = new ClientTokenStore(clock, 12 * 60 * 60 * 1000);
  const issued = store.issue('student@msu.ac.th');
  assert.equal(store.find(issued.token), 'student@msu.ac.th');
  assert.equal(store.find('not-a-token'), null);
  clock.now = () => new Date('2026-09-10T21:00:00.000Z');
  assert.equal(store.find(issued.token), null);
});
