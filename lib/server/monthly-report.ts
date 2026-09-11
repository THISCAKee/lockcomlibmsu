import { MACHINE_ZONES, machineCountForZone, zoneForMachine } from './zones';
import type { MonthlyReportView, Session } from './types';

export class MonthlyReportBuilder {
  static build(sessions: Iterable<Session>, month: string): MonthlyReportView {
    const start = Date.parse(`${month}-01T00:00:00.000Z`);
    const end = Date.parse(`${month}-01T00:00:00.000Z`) + 32 * 24 * 60 * 60 * 1000;
    const endDate = new Date(end);
    endDate.setUTCDate(1);
    const monthEnd = endDate.getTime();
    const groups = new Map<string, { zone: string; userEmail: string; machineId: string; sessionCount: number; hours: number }>();
    const zoneGroups = new Map(MACHINE_ZONES.map(zone => [zone.name, {
      zone: zone.name,
      machineCount: machineCountForZone(zone.name),
      sessionCount: 0,
      hours: 0,
    }]));

    for (const session of Array.from(sessions)) {
      const started = Date.parse(session.startedAt);
      const finished = Date.parse(session.endedAt ?? session.expiresAt);
      if (!Number.isFinite(started) || !Number.isFinite(finished) || started >= monthEnd || finished <= start) continue;
      const zone = zoneForMachine(session.machineId) ?? 'ไม่ระบุ';
      const key = `${session.userEmail}|${session.machineId}`;
      const group = groups.get(key) ?? { zone, userEmail: session.userEmail, machineId: session.machineId, sessionCount: 0, hours: 0 };
      const hours = Math.max(0, (finished - started) / (60 * 60 * 1000));
      group.sessionCount += 1;
      group.hours += hours;
      groups.set(key, group);
      const zoneGroup = zoneGroups.get(zone);
      if (zoneGroup) {
        zoneGroup.sessionCount += 1;
        zoneGroup.hours += hours;
      }
    }

    const rows = Array.from(groups.entries())
      .map(([key, row]) => ({ key, zone: row.zone, userEmail: row.userEmail, machineId: row.machineId, sessionCount: row.sessionCount, hours: Math.round(row.hours * 100) / 100 }))
      .sort((left, right) => left.userEmail.localeCompare(right.userEmail) || left.machineId.localeCompare(right.machineId));
    const zoneRows = Array.from(zoneGroups.values()).map(row => ({
      ...row,
      hours: Math.round(row.hours * 100) / 100,
    }));
    return { month, rows, zoneRows, totalHours: Math.round(rows.reduce((total, row) => total + row.hours, 0) * 100) / 100 };
  }
}
