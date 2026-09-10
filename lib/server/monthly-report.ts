import type { MonthlyReportView, Session } from './types';

export class MonthlyReportBuilder {
  static build(sessions: Iterable<Session>, month: string): MonthlyReportView {
    const start = Date.parse(`${month}-01T00:00:00.000Z`);
    const end = Date.parse(`${month}-01T00:00:00.000Z`) + 32 * 24 * 60 * 60 * 1000;
    const endDate = new Date(end);
    endDate.setUTCDate(1);
    const monthEnd = endDate.getTime();
    const groups = new Map<string, { userEmail: string; machineId: string; sessionCount: number; hours: number }>();

    for (const session of Array.from(sessions)) {
      const started = Date.parse(session.startedAt);
      const finished = Date.parse(session.endedAt ?? session.expiresAt);
      if (!Number.isFinite(started) || !Number.isFinite(finished) || started >= monthEnd || finished <= start) continue;
      const key = `${session.userEmail}|${session.machineId}`;
      const group = groups.get(key) ?? { userEmail: session.userEmail, machineId: session.machineId, sessionCount: 0, hours: 0 };
      group.sessionCount += 1;
      group.hours += Math.max(0, (finished - started) / (60 * 60 * 1000));
      groups.set(key, group);
    }

    const rows = Array.from(groups.entries())
      .map(([key, row]) => ({ key, userEmail: row.userEmail, machineId: row.machineId, sessionCount: row.sessionCount, hours: Math.round(row.hours * 100) / 100 }))
      .sort((left, right) => left.userEmail.localeCompare(right.userEmail) || left.machineId.localeCompare(right.machineId));
    return { month, rows, totalHours: Math.round(rows.reduce((total, row) => total + row.hours, 0) * 100) / 100 };
  }
}
