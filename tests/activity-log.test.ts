import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivityLog } from '../lib/server/activity-log';
import { parseSessionRow } from '../lib/server/session-manager';
import type { Session } from '../lib/server/types';

const sessions = [
  ['s1', 'PC-185', '6410022@msu.ac.th', '2026-11-13T06:04:57.461Z', '2026-11-13T09:04:57.461Z', 'Active', '', 'created'],
  ['s1', 'PC-185', '6410022@msu.ac.th', '2026-11-13T06:04:57.461Z', '2026-11-13T09:04:57.461Z', 'ForceLoggedOut', '2026-11-13T07:26:18.871Z', 'updated'],
  ['s2', 'PC-184', '6410022@msu.ac.th', '2026-11-13T07:36:34.231Z', '2026-11-13T10:36:34.231Z', 'Active', '', 'created'],
  ['s2', 'PC-184', '6410022@msu.ac.th', '2026-11-13T07:36:34.231Z', '2026-11-13T10:36:34.231Z', 'LoggedOut', '2026-11-13T07:50:53.977Z', 'updated'],
  ['s3', 'PC-203', 'other@msu.ac.th', '2026-11-13T03:21:06.470Z', '2026-11-13T06:21:06.470Z', 'Active', '', 'created'],
].map(parseSessionRow).filter((value): value is Session => value !== null);

const events = [
  ['timestamp', 'sessionId', 'machineId', 'userEmail', 'event', 'details'],
  ['2026-11-13T06:04:57.952Z', 's1', 'PC-185', '6410022@msu.ac.th', 'check-in', ''],
  ['2026-11-13T07:26:19.348Z', 's1', 'PC-185', 'khunanon.m@msu.ac.th', 'force-logout', ''],
  ['2026-11-13T07:32:09.621Z', 'cmd', 'PC-185', 'khunanon.m@msu.ac.th', 'close-requested', 'remote-admin'],
  ['2026-11-13T07:32:18.404Z', 'cmd', 'PC-185', '', 'close-dispatched', 'remote-admin'],
  ['2026-11-13T07:36:34.611Z', 's2', 'PC-184', '6410022@msu.ac.th', 'check-in', ''],
  ['2026-11-13T07:50:55.097Z', 's2', 'PC-184', '6410022@msu.ac.th', 'logout', ''],
  ['2026-11-12T07:50:55.097Z', 'old', 'PC-001', 'a@msu.ac.th', 'check-in', ''],
  ['2026-11-13T07:00:00.000Z', '', '', 'khunanon.m@msu.ac.th', 'admin-added', 'x@msu.ac.th'],
];

const now = new Date('2026-11-13T12:00:00.000Z');

test('activity log lists the day in order with user, actor role and duration', () => {
  const entries = buildActivityLog(events, sessions, '2026-11-13', now);
  assert.deepEqual(entries.map(entry => entry.action), ['check-in', 'expired', 'force-logout', 'close-requested', 'close-dispatched', 'check-in', 'logout']);
  const forced = entries.find(entry => entry.action === 'force-logout')!;
  assert.equal(forced.userEmail, '6410022@msu.ac.th');
  assert.equal(forced.actorRole, 'admin');
  assert.equal(forced.usedMinutes, 81);
  const logout = entries.find(entry => entry.action === 'logout')!;
  assert.equal(logout.actorRole, 'user');
  assert.equal(logout.usedMinutes, 14);
  assert.equal(entries.find(entry => entry.action === 'close-dispatched')!.actorRole, 'system');
  const expired = entries.find(entry => entry.action === 'expired')!;
  assert.equal(expired.userEmail, 'other@msu.ac.th');
  assert.equal(expired.usedMinutes, 180);
});

test('activity log filters by user email', () => {
  const entries = buildActivityLog(events, sessions, '2026-11-13', now, '6410022@MSU.ac.th ');
  assert.deepEqual(entries.map(entry => entry.action), ['check-in', 'force-logout', 'check-in', 'logout']);
});

test('active sessions that have not expired yet produce no expiry entry', () => {
  const entries = buildActivityLog([], sessions, '2026-11-13', new Date('2026-11-13T05:00:00.000Z'));
  assert.equal(entries.length, 0);
});
