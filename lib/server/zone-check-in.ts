import { MACHINE_ZONES } from './zones';
import { dailyUsage, validateZones, type Zone } from './zone-policy';
import { sessionRow } from './route-views';
import { SessionConflictError, type Clock, type SessionManager } from './session-manager';
import type { SheetStore } from './store';

export function defaultZones(): Zone[] {
  return MACHINE_ZONES.map((zone, index) => ({ id: `default-${index}`, name: zone.name, machines: Array.from({ length: zone.end - zone.start + 1 }, (_, i) => `PC-${String(zone.start + i).padStart(3, '0')}`), dailyLimit: null }));
}
export class ZoneCheckIn {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private store: SheetStore, private sessions: SessionManager, private clock: Clock, private machineCount: number) {}
  private locked<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }
  async loadZones() { const value = await this.store.loadZones(); return value === null ? defaultZones() : validateZones(value, this.machineCount); }
  async usageForEmail(email: string) {
    const [zones, rows] = await Promise.all([this.loadZones(), this.store.loadSessions()]);
    const records = Array.from(new Map(rows.map(session => [session.id, session])).values());
    const attributed = records.map(session => session.zoneId ? session : { ...session, zoneId: zones.find(zone => zone.machines.includes(session.machineId.toUpperCase()))?.id });
    return zones.map(zone => {
      const used = dailyUsage(attributed, email, zone.id, this.clock.now());
      return { id: zone.id, name: zone.name, dailyLimit: zone.dailyLimit, used, remaining: zone.dailyLimit === null ? null : Math.max(0, zone.dailyLimit - used) };
    });
  }
  saveZones(value: unknown) { return this.locked(async () => { const zones = validateZones(value, this.machineCount); await this.store.saveZones(zones); return zones; }); }
  checkIn(machineId: string, email: string) { return this.locked(async () => {
    const zones = await this.loadZones();
    const zone = zones.find(z => z.machines.includes(machineId.toUpperCase()));
    const records = await this.store.loadSessions();
    this.sessions.replace(records);
    const attributed = this.sessions.listSessions().map(s => s.zoneId ? s : { ...s, zoneId: zones.find(z => z.machines.includes(s.machineId.toUpperCase()))?.id });
    if (zone?.dailyLimit !== null && zone?.dailyLimit !== undefined && dailyUsage(attributed, email, zone.id, this.clock.now()) >= zone.dailyLimit) {
      throw new SessionConflictError(`คุณใช้สิทธิ์โซน ${zone.name} ครบ ${zone.dailyLimit} ครั้งแล้ว กรุณาใช้งานอีกครั้งหลังเที่ยงคืน`);
    }
    const session = this.sessions.checkIn(machineId, email);
    session.zoneId = zone?.id ?? '_unassigned';
    session.zoneName = zone?.name ?? 'ไม่ระบุ';
    try { await this.store.appendSession(sessionRow(session, 'created')); }
    catch (error) { this.sessions.replace(records); throw error; }
    return session;
  }); }
}
