import test from 'node:test';
import assert from 'node:assert/strict';
import { MonthlyReportBuilder } from '../lib/server/monthly-report';
import type { Session } from '../lib/server/types';

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
