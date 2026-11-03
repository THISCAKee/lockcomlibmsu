import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySheetStore } from '../lib/server/store';
import { SessionManager } from '../lib/server/session-manager';
import { sessionRow } from '../lib/server/route-views';

test('persists zone settings including an empty configuration', async () => {
  const store = new InMemorySheetStore();
  assert.equal(await store.loadZones(), null);
  await store.saveZones([]);
  assert.deepEqual(await store.loadZones(), []);
});
test('session rows preserve zone attribution across updates', () => {
  const manager = new SessionManager({ now: () => new Date('2026-11-03T00:00:00Z') }, 3600000);
  const session = manager.checkIn('PC-001', 'x@msu.ac.th');
  session.zoneId = 'a'; session.zoneName = 'A';
  const restored = new SessionManager({ now: () => new Date('2026-11-03T00:00:00Z') }, 3600000);
  restored.restore([sessionRow(session, 'created')]);
  assert.equal(restored.get(session.id).zoneId, 'a');
});
