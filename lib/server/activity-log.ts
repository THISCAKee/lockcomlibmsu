import { bangkokDay } from './zone-policy';
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
};

const detailLabels: Record<string, string> = {
  'remote-close': 'จากการสั่งปิดโปรแกรม',
  'remote-shutdown': 'จากการสั่งปิดเครื่อง',
  'remote-admin': '',
};

const sessionEndingActions = new Set(['logout', 'force-logout', 'expired']);

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
): ActivityEntry[] {
  const byId = latestSessions(sessionRecords);
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
      usedMinutes: minutesBetween(session.startedAt, session.expiresAt),
    });
  }

  const filter = email?.trim().toLowerCase();
  return entries
    .filter(entry => !filter || entry.userEmail?.toLowerCase() === filter || entry.actor?.toLowerCase() === filter)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
