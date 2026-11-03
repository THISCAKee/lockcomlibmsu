import test from 'node:test';
import assert from 'node:assert/strict';
import { ZoneCheckIn } from '../lib/server/zone-check-in';
import { InMemorySheetStore } from '../lib/server/store';
import { SessionManager } from '../lib/server/session-manager';
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
