import { bangkokDay, type Zone } from './zone-policy';
import type { Session } from './types';

export type ActorRole = 'user' | 'admin' | 'system';

export type ActivityEntry = {
  at: string;
  machineId: string;
  userEmail: string | null;
  action: string;
  label: string;
  actor: string | null;
  actorRole: ActorRole;
  detail: string;
  sessionId: string;
  /** Zone at check-in time when known, otherwise the machine's current zone. */
  zone: string;
  /** Minutes since the session started, for events that end a session. */
  usedMinutes: number | null;
};

const labels: Record<string, string> = {
  'check-in': 'เข้าใช้งาน',
  logout: 'ออกจากระบบ',
  'force-logout': 'แอดมินบังคับออกจากระบบ',
  expired: 'หมดเวลาใช้งาน',
  'close-requested': 'สั่งปิดโปรแกรม',
  'close-dispatched': 'เครื่องรับคำสั่งปิดโปรแกรม',
  'shutdown-requested': 'สั่งปิดเครื่อง',
  'shutdown-dispatched': 'เครื่องรับคำสั่งปิดเครื่อง',
  'client-disconnected': 'หลุดเพราะเชื่อมต่อ server ไม่ได้',
};

const detailLabels: Record<string, string> = {
  'remote-close': 'จากการสั่งปิดโปรแกรม',
  'remote-shutdown': 'จากการสั่งปิดเครื่อง',
  'remote-admin': '',
  'heartbeat-timeout': 'ติดต่อ server ไม่ได้ติดต่อกันนานเกิน 3 นาที',
  offline: 'ขณะเครื่องติดต่อ server ไม่ได้',
  'session-missing': 'server ไม่พบ session นี้',
  'session-forbidden': 'session ไม่ตรงกับบัญชีที่ login',
};

export const UNASSIGNED_ZONE = 'ไม่ระบุ';

const sessionEndingActions = new Set(['logout', 'force-logout', 'expired', 'client-disconnected']);

export function isValidDay(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

/** Latest row per session id wins, matching how the sessions sheet is appended. */
function latestSessions(sessions: Iterable<Session>) {
  const byId = new Map<string, Session>();
  for (const session of sessions) byId.set(session.id, session);
  return byId;
}

function sessionAt(sessions: Session[], machineId: string, at: number) {
  return sessions.find(session => session.machineId.toLowerCase() === machineId.toLowerCase()
    && Date.parse(session.startedAt) <= at
    && Date.parse(session.endedAt ?? session.expiresAt) >= at);
}

function minutesBetween(from: string, to: string) {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
}

export function buildActivityLog(
  eventRows: unknown[][],
  sessionRecords: Iterable<Session>,
  day: string,
  now: Date,
  email?: string,
  zones: Zone[] = [],
): ActivityEntry[] {
  const byId = latestSessions(sessionRecords);
  const zoneOf = (session: Session | undefined, machineId: string) =>
    session?.zoneName || zones.find(zone => zone.machines.includes(machineId.toUpperCase()))?.name || UNASSIGNED_ZONE;
  const sessions = Array.from(byId.values());
  const entries: ActivityEntry[] = [];

  for (const row of eventRows) {
    const [at, sessionId, machineId, actorValue, action, detail] = row.map(value => String(value ?? '').trim());
    if (!machineId || !action || !Number.isFinite(Date.parse(at))) continue;
    if (bangkokDay(at) !== day) continue;

    const session = byId.get(sessionId) ?? sessionAt(sessions, machineId, Date.parse(at));
    const userEmail = session?.userEmail ?? (action === 'check-in' || action === 'logout' ? actorValue || null : null);
    const actor = actorValue || null;
    const actorRole: ActorRole = !actor ? 'system' : userEmail && actor.toLowerCase() === userEmail.toLowerCase() ? 'user' : 'admin';
    entries.push({
      at: new Date(at).toISOString(),
      machineId,
      userEmail,
      action,
      label: labels[action] ?? action,
      actor,
      actorRole,
      detail: detailLabels[detail] ?? detail,
      sessionId,
      zone: zoneOf(session, machineId),
      usedMinutes: session && sessionEndingActions.has(action) ? minutesBetween(session.startedAt, at) : null,
    });
  }

  // Expiry is never written to the events sheet, so derive it from the sessions themselves.
  for (const session of sessions) {
    const expired = session.status === 'Expired' || (session.status === 'Active' && Date.parse(session.expiresAt) <= now.getTime());
    if (!expired || bangkokDay(session.expiresAt) !== day) continue;
    entries.push({
      at: new Date(session.expiresAt).toISOString(),
      machineId: session.machineId,
      userEmail: session.userEmail,
      action: 'expired',
      label: labels.expired,
      actor: null,
      actorRole: 'system',
      detail: '',
      sessionId: session.id,
      zone: zoneOf(session, session.machineId),
      usedMinutes: minutesBetween(session.startedAt, session.expiresAt),
    });
  }

  const filter = email?.trim().toLowerCase();
  return entries
    .filter(entry => !filter || entry.userEmail?.toLowerCase() === filter || entry.actor?.toLowerCase() === filter)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
