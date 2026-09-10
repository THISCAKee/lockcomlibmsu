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
