import test from 'node:test';
import assert from 'node:assert/strict';
import { MonthlyReportBuilder } from '../lib/server/monthly-report';
import type { Session } from '../lib/server/types';

const session = (id: string, machineId: string, userEmail: string, startedAt: string, endedAt: string): Session => ({
  id, machineId, userEmail, startedAt, endedAt,
  expiresAt: endedAt,
  status: 'LoggedOut',
});

test('groups overlapping sessions by month, user, and machine', () => {
  const sessions: Session[] = [
    {
      id: 'one', machineId: 'PC-001', userEmail: 'student@msu.ac.th',
      startedAt: '2026-09-10T08:00:00.000Z', expiresAt: '2026-09-10T11:00:00.000Z',
      endedAt: '2026-09-10T10:00:00.000Z', status: 'LoggedOut',
    },
    {
      id: 'two', machineId: 'PC-001', userEmail: 'student@msu.ac.th',
      startedAt: '2026-09-11T08:00:00.000Z', expiresAt: '2026-09-11T11:00:00.000Z',
      endedAt: '2026-09-11T11:00:00.000Z', status: 'Expired',
    },
  ];
  const report = MonthlyReportBuilder.build(sessions, '2026-09');
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].sessionCount, 2);
  assert.equal(report.rows[0].hours, 5);
  assert.equal(report.totalHours, 5);
});

test('assigns sessions to zones and aggregates monthly usage by zone', () => {
  const report = MonthlyReportBuilder.build([
    session('one', 'PC-001', 'a@msu.ac.th', '2026-09-01T08:00:00.000Z', '2026-09-01T10:00:00.000Z'),
    session('two', 'PC-051', 'b@msu.ac.th', '2026-09-02T08:00:00.000Z', '2026-09-02T11:00:00.000Z'),
    session('three', 'PC-202', 'c@msu.ac.th', '2026-09-03T08:00:00.000Z', '2026-09-03T09:00:00.000Z'),
  ], '2026-09');

  assert.equal(report.rows.find(row => row.machineId === 'PC-001')?.zone, 'A-407');
  assert.deepEqual(report.zoneRows, [
    { zone: 'A-407', machineCount: 50, sessionCount: 1, hours: 2 },
    { zone: 'A-412', machineCount: 50, sessionCount: 1, hours: 3 },
    { zone: 'A-410', machineCount: 50, sessionCount: 0, hours: 0 },
    { zone: 'ชั้น-3', machineCount: 21, sessionCount: 0, hours: 0 },
    { zone: 'DLP', machineCount: 30, sessionCount: 0, hours: 0 },
    { zone: 'ศูนย์อีสาน', machineCount: 2, sessionCount: 1, hours: 1 },
  ]);
});
