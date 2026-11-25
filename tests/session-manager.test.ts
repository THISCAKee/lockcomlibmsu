import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../lib/server/session-manager';
import { ManualClock } from './test-clock';

const THREE_HOURS = 3 * 60 * 60 * 1000;

test('rejects duplicate machine and user sessions', () => {
  const manager = new SessionManager(new ManualClock(), THREE_HOURS);
  manager.checkIn('PC-001', 'student@msu.ac.th');
  assert.throws(() => manager.checkIn('PC-001', 'other@msu.ac.th'), /Machine is already in use/);
  assert.throws(() => manager.checkIn('PC-002', 'student@msu.ac.th'), /User already has an active session/);
});

test('expires a session after its configured duration', () => {
  const clock = new ManualClock();
  const manager = new SessionManager(clock, THREE_HOURS);
  const session = manager.checkIn('PC-001', 'student@msu.ac.th');
  clock.advance(THREE_HOURS);
  manager.reconcileExpiredSessions();
  assert.equal(manager.get(session.id).status, 'Expired');
  assert.equal(manager.getActiveForMachine('PC-001'), null);
});

test('force logout marks an active session and sets endedAt', () => {
  const clock = new ManualClock();
  const manager = new SessionManager(clock, THREE_HOURS);
  const session = manager.checkIn('PC-001', 'student@msu.ac.th');
  manager.forceLogout(session.id);
  const ended = manager.get(session.id);
  assert.equal(ended.status, 'ForceLoggedOut');
  assert.equal(ended.endedAt, clock.now().toISOString());
});

test('restores session rows and ignores malformed rows', () => {
  const manager = new SessionManager(new ManualClock(), THREE_HOURS);
  manager.restore([
    ['session-1', 'PC-001', 'student@msu.ac.th', '2026-09-10T08:00:00.000Z', '2026-09-10T11:00:00.000Z', 'Active', ''],
    ['invalid', 'PC-002'],
  ]);
  assert.equal(manager.listSessions().length, 1);
  assert.equal(manager.get('session-1').machineId, 'PC-001');
});

test('a stale reload from the sheet does not erase a fresh check-in or logout', () => {
  const clock = new ManualClock();
  const manager = new SessionManager(clock, THREE_HOURS);
  const staleSheet: unknown[][] = []; // read before the check-in row was appended
  const session = manager.checkIn('PC-001', 'student@msu.ac.th');
  manager.replace(staleSheet);
  assert.equal(manager.get(session.id).status, 'Active');

  const sheetWithActive = [[session.id, 'PC-001', 'student@msu.ac.th', session.startedAt, session.expiresAt, 'Active', '']];
  manager.logout(session.id);
  manager.replace(sheetWithActive); // read before the logout row was appended
  assert.equal(manager.get(session.id).status, 'LoggedOut');

  // Once the window has passed, the sheet is authoritative again (e.g. rows edited by hand).
  clock.advance(3 * 60 * 1000);
  manager.replace([]);
  assert.throws(() => manager.get(session.id), /was not found/);
});

test('re-login by the same user on the same machine closes the old session right away', () => {
  const clock = new ManualClock();
  const manager = new SessionManager(clock, THREE_HOURS);
  const old = manager.checkIn('PC-001', 'student@msu.ac.th');
  clock.advance(30_000);
  assert.deepEqual(manager.closeAbandoned('PC-001', 'other@msu.ac.th'), []);
  const closed = manager.closeAbandoned('PC-001', 'student@msu.ac.th');
  assert.deepEqual(closed.map(item => item.reason), ['same-user-relogin']);
  assert.equal(manager.get(old.id).status, 'LoggedOut');
  assert.equal(manager.checkIn('PC-001', 'student@msu.ac.th').status, 'Active');
});

test('a session without heartbeats for 4 minutes no longer blocks the machine or the user', () => {
  const clock = new ManualClock();
  const manager = new SessionManager(clock, THREE_HOURS);
  const old = manager.checkIn('PC-001', 'student@msu.ac.th');
  clock.advance(3 * 60 * 1000);
  manager.touch(old.id);
  clock.advance(3 * 60 * 1000);
  assert.deepEqual(manager.closeAbandoned('PC-001', 'other@msu.ac.th'), []);
  assert.throws(() => manager.checkIn('PC-001', 'other@msu.ac.th'), /Machine is already in use/);
  clock.advance(61_000);
  const closed = manager.closeAbandoned('PC-002', 'student@msu.ac.th');
  assert.deepEqual(closed.map(item => item.reason), ['no-heartbeat']);
  assert.equal(manager.get(old.id).endedAt, new Date(Date.parse(old.startedAt) + 3 * 60 * 1000).toISOString());
});

test('closeStale frees machines whose Client stopped heartbeating and keeps live ones', () => {
  const clock = new ManualClock();
  const manager = new SessionManager(clock, THREE_HOURS);
  const gone = manager.checkIn('PC-001', 'gone@msu.ac.th');
  const live = manager.checkIn('PC-002', 'live@msu.ac.th');
  clock.advance(4 * 60 * 1000);
  manager.touch(live.id);
  assert.deepEqual(manager.closeStale(), []);
  clock.advance(1000);
  const closed = manager.closeStale();
  assert.deepEqual(closed.map(item => [item.session.id, item.reason]), [[gone.id, 'no-heartbeat']]);
  assert.equal(manager.get(gone.id).status, 'LoggedOut');
  assert.equal(manager.get(gone.id).endedAt, gone.startedAt);
  assert.equal(manager.get(live.id).status, 'Active');
  assert.equal(manager.checkIn('PC-001', 'next@msu.ac.th').status, 'Active');
});
