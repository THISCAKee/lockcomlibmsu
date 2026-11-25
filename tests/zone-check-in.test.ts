import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoneCheckIn } from '../lib/server/zone-check-in';
import { InMemorySheetStore } from '../lib/server/store';
import { SessionManager } from '../lib/server/session-manager';
import { ManualClock } from './test-clock';
const clock = { now: () => new Date('2026-11-03T03:00:00Z') };
test('serializes simultaneous check-ins and persists limits', async () => {
  const store = new InMemorySheetStore();
  const manager = new SessionManager(clock, 1000);
  const service = new ZoneCheckIn(store, manager, clock, 203);
  await service.saveZones([{ id: 'z', name: 'Zone', machines: ['PC-001', 'PC-002'], dailyLimit: 1 }]);
  await service.checkIn('PC-001', 'one@msu.ac.th');
  manager.logout(manager.listSessions()[0].id);
  await assert.rejects(() => service.checkIn('PC-002', 'ONE@msu.ac.th'), /ครบ/);
  const restarted = new ZoneCheckIn(store, new SessionManager(clock, 1000), clock, 203);
  await assert.rejects(() => restarted.checkIn('PC-002', 'one@msu.ac.th'), /ครบ/);
});
test('does not retain a session when saving fails', async () => {
  const store = new InMemorySheetStore();
  store.appendSession = async () => { throw new Error('offline'); };
  const manager = new SessionManager(clock, 1000);
  const service = new ZoneCheckIn(store, manager, clock, 203);
  await assert.rejects(() => service.checkIn('PC-001', 'one@msu.ac.th'), /offline/);
  assert.equal(manager.listSessions().length, 0);
});
test('concurrent attempts cannot exceed a daily quota', async () => {
  const store = new InMemorySheetStore();
  const manager = new SessionManager(clock, 1000);
  const service = new ZoneCheckIn(store, manager, clock, 203);
  await service.saveZones([{ id: 'z', name: 'Zone', machines: ['PC-001', 'PC-002'], dailyLimit: 1 }]);
  const results = await Promise.allSettled([service.checkIn('PC-001', 'one@msu.ac.th'), service.checkIn('PC-002', 'ONE@msu.ac.th')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(store.sessionRows.length, 1);
});
test('session updates do not count as additional visits', async () => {
  const store = new InMemorySheetStore();
  const manager = new SessionManager(clock, 1000);
  const service = new ZoneCheckIn(store, manager, clock, 203);
  await service.saveZones([{ id: 'z', name: 'Zone', machines: ['PC-001'], dailyLimit: 2 }]);
  const first = await service.checkIn('PC-001', 'one@msu.ac.th');
  manager.logout(first.id);
  await store.appendSession([first.id, first.machineId, first.userEmail, first.startedAt, first.expiresAt, first.status, first.endedAt, 'updated', first.zoneId, first.zoneName]);
  await service.checkIn('PC-001', 'one@msu.ac.th');
  assert.equal(store.sessionRows.length, 3);
});
test('daily usage shows used and remaining quota by zone without counting update rows twice', async () => {
  const store = new InMemorySheetStore();
  const manager = new SessionManager(clock, 1000);
  const service = new ZoneCheckIn(store, manager, clock, 203);
  await service.saveZones([{ id: 'z', name: 'Zone', machines: ['PC-001'], dailyLimit: 2 }, { id: 'free', name: 'Free', machines: ['PC-002'], dailyLimit: null }]);
  const session = await service.checkIn('PC-001', 'one@msu.ac.th');
  manager.logout(session.id);
  await store.appendSession([session.id, session.machineId, session.userEmail, session.startedAt, session.expiresAt, session.status, session.endedAt, 'updated', session.zoneId, session.zoneName]);
  assert.deepEqual(await service.usageForEmail('ONE@msu.ac.th'), [{ id: 'z', name: 'Zone', dailyLimit: 2, used: 1, remaining: 1 }, { id: 'free', name: 'Free', dailyLimit: null, used: 0, remaining: null }]);
});

test('re-login after being kicked out replaces the leftover session without using another daily turn', async () => {
  const { InMemorySheetStore } = await import('../lib/server/store');
  const { SessionManager } = await import('../lib/server/session-manager');
  const { ZoneCheckIn } = await import('../lib/server/zone-check-in');
  const clock = { now: () => new Date('2026-11-16T08:29:00.000Z') };
  const store = new InMemorySheetStore();
  await store.saveZones([{ id: 'dlp', name: 'DLP', machines: ['PC-181'], dailyLimit: 1 }]);
  const sessions = new SessionManager(clock, 3 * 60 * 60 * 1000);
  const checkIn = new ZoneCheckIn(store, sessions, clock, 203);
  const first = await checkIn.checkIn('PC-181', 'student@msu.ac.th');
  clock.now = () => new Date('2026-11-16T08:40:00.000Z');
  const second = await checkIn.checkIn('PC-181', 'student@msu.ac.th');
  assert.notEqual(second.id, first.id);
  assert.equal(sessions.get(first.id).status, 'LoggedOut');
  assert.equal(store.eventRows.some(row => row[1] === first.id && row[4] === 'session-abandoned' && row[5] === 'same-user-relogin'), true);
});
test('closeStaleSessions records sessions whose Client went away', async () => {
  const time = new ManualClock(new Date('2026-11-03T03:00:00Z'));
  const store = new InMemorySheetStore();
  const sessions = new SessionManager(time, 3 * 60 * 60 * 1000);
  const service = new ZoneCheckIn(store, sessions, time, 203);
  const session = await service.checkIn('PC-194', 'student@msu.ac.th');
  time.advance(3 * 60 * 1000);
  assert.deepEqual(await service.closeStaleSessions(), []);
  time.advance(2 * 60 * 1000);
  const closed = await service.closeStaleSessions();
  assert.deepEqual(closed.map(item => item.session.id), [session.id]);
  assert.equal(sessions.get(session.id).status, 'LoggedOut');
  assert.equal(store.sessionRows.some(row => row[0] === session.id && row[5] === 'LoggedOut'), true);
  assert.equal(store.eventRows.some(row => row[1] === session.id && row[4] === 'session-abandoned' && row[5] === 'no-heartbeat'), true);
});
