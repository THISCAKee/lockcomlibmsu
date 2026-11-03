import test from 'node:test';
import assert from 'node:assert/strict';
import { validateZones, dailyUsage } from '../lib/server/zone-policy';
test('rejects overlapping machines', () => {
  assert.throws(() => validateZones([{ id: 'a', name: 'A', machines: ['PC-001'], dailyLimit: 2 }, { id: 'b', name: 'B', machines: ['PC-001'], dailyLimit: 1 }], 203), /machine/i);
});
test('counts matching email and zone using Bangkok calendar days', () => {
  const sessions = [
    { userEmail: 'USER@msu.ac.th', zoneId: 'a', startedAt: '2026-11-02T17:01:00Z' },
    { userEmail: 'user@msu.ac.th', zoneId: 'a', startedAt: '2026-11-02T16:59:00Z' },
    { userEmail: 'user@msu.ac.th', zoneId: 'b', startedAt: '2026-11-02T17:01:00Z' },
  ];
  assert.equal(dailyUsage(sessions, 'user@msu.ac.th', 'a', new Date('2026-11-03T08:00:00Z')), 1);
});
