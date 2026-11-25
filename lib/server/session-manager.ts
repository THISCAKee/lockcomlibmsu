import { randomUUID } from 'node:crypto';
import type { Session, SessionStatus } from './types';

export type Clock = { now(): Date };

export class SessionConflictError extends Error {}
export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session '${id}' was not found.`);
  }
}

const statuses = new Set<SessionStatus>(['Active', 'LoggedOut', 'Expired', 'ForceLoggedOut']);

/**
 * A reload from Google Sheets can return data that is a few seconds old (a read that started
 * before our own append finished, or Sheets read-after-write lag). Changes made by this server
 * within this window win over the reloaded copy, so a fresh check-in or logout is never undone.
 */
export const LOCAL_CHANGE_WINS_MS = 2 * 60 * 1000;

/**
 * A Client heartbeats every 15 seconds and gives up after 3 minutes offline, so an active
 * session with no heartbeat for longer than this has been abandoned (crash, power off,
 * or a Client that returned to the login screen without telling the server).
 */
export const ABANDONED_AFTER_MS = 4 * 60 * 1000;

export type AbandonedReason = 'same-user-relogin' | 'no-heartbeat';
export type AbandonedSession = { session: Session; reason: AbandonedReason };

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly localChanges = new Map<string, number>();
  private readonly lastSeen = new Map<string, number>();
  private readonly bootedAt: number;

  constructor(private readonly clock: Clock, private readonly sessionDurationMs: number) {
    this.bootedAt = clock.now().getTime();
  }

  checkIn(machineId: string, userEmail: string): Session {
    const normalizedMachineId = machineId.trim();
    const normalizedEmail = userEmail.trim();
    if (!normalizedMachineId || !normalizedEmail) throw new TypeError('MachineId and userEmail are required.');

    this.reconcileExpiredSessions();
    const machineConflict = Array.from(this.sessions.values()).find(session => session.status === 'Active' && session.machineId.toLowerCase() === normalizedMachineId.toLowerCase());
    if (machineConflict) {
      throw new SessionConflictError(`เครื่องนี้ยังมีผู้ใช้งานค้างอยู่ (Machine is already in use.) กรุณารอประมาณ ${this.minutesUntilAbandoned(machineConflict)} นาทีแล้วลองใหม่ หรือแจ้งผู้ดูแลระบบ`);
    }
    const userConflict = Array.from(this.sessions.values()).find(session => session.status === 'Active' && session.userEmail.toLowerCase() === normalizedEmail.toLowerCase());
    if (userConflict) {
      throw new SessionConflictError(`บัญชีนี้กำลังใช้งานอยู่ที่เครื่อง ${userConflict.machineId} (User already has an active session.) กรุณาออกจากระบบที่เครื่องนั้น หรือรอประมาณ ${this.minutesUntilAbandoned(userConflict)} นาทีแล้วลองใหม่`);
    }

    const startedAt = this.clock.now();
    const session: Session = {
      id: randomUUID().replaceAll('-', ''),
      machineId: normalizedMachineId,
      userEmail: normalizedEmail,
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + this.sessionDurationMs).toISOString(),
      status: 'Active',
    };
    this.sessions.set(session.id, session);
    this.markLocalChange(session.id);
    this.lastSeen.set(session.id, startedAt.getTime());
    return session;
  }

  /** Records a heartbeat from the Client running this session. */
  touch(id: string) {
    this.lastSeen.set(id, this.clock.now().getTime());
  }

  lastSeenAt(session: Session) {
    return this.lastSeen.get(session.id) ?? Math.max(Date.parse(session.startedAt), this.bootedAt);
  }

  /**
   * Ends active sessions that would block this check-in but are no longer being used:
   * the same person signing in again on the same machine (their Client is at the login
   * screen, so the old session is gone), or a session whose Client stopped heartbeating.
   */
  closeAbandoned(machineId: string, userEmail: string): AbandonedSession[] {
    this.reconcileExpiredSessions();
    const machine = machineId.trim().toLowerCase();
    const email = userEmail.trim().toLowerCase();
    const now = this.clock.now().getTime();
    const closed: AbandonedSession[] = [];
    for (const session of Array.from(this.sessions.values())) {
      if (session.status !== 'Active') continue;
      const sameMachine = session.machineId.toLowerCase() === machine;
      const sameUser = session.userEmail.toLowerCase() === email;
      if (!sameMachine && !sameUser) continue;
      const lastSeen = this.lastSeenAt(session);
      const reason: AbandonedReason | null = sameMachine && sameUser
        ? 'same-user-relogin'
        : now - lastSeen > ABANDONED_AFTER_MS ? 'no-heartbeat' : null;
      if (!reason) continue;
      this.end(session.id, 'LoggedOut', new Date(reason === 'no-heartbeat' ? lastSeen : now));
      closed.push({ session, reason });
    }
    return closed;
  }

  /**
   * Ends every active session whose Client stopped heartbeating (power off, crash, network
   * loss), so the dashboard stops showing the machine as in use. Ends it at the last heartbeat.
   */
  closeStale(): AbandonedSession[] {
    this.reconcileExpiredSessions();
    const now = this.clock.now().getTime();
    const closed: AbandonedSession[] = [];
    for (const session of Array.from(this.sessions.values())) {
      if (session.status !== 'Active') continue;
      const lastSeen = this.lastSeenAt(session);
      if (now - lastSeen <= ABANDONED_AFTER_MS) continue;
      this.end(session.id, 'LoggedOut', new Date(lastSeen));
      closed.push({ session, reason: 'no-heartbeat' });
    }
    return closed;
  }

  /** Drops a session that was never persisted (its sheet append failed). */
  discard(id: string) {
    this.sessions.delete(id);
    this.localChanges.delete(id);
    this.lastSeen.delete(id);
  }

  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new SessionNotFoundError(id);
    return session;
  }

  getActiveForMachine(machineId: string): Session | null {
    this.reconcileExpiredSessions();
    return Array.from(this.sessions.values()).find(session => session.status === 'Active' && session.machineId.toLowerCase() === machineId.trim().toLowerCase()) ?? null;
  }

  logout(id: string, endedAt?: Date) {
    this.end(id, 'LoggedOut', endedAt);
  }

  forceLogout(id: string) {
    this.end(id, 'ForceLoggedOut');
  }

  reconcileExpiredSessions() {
    const now = this.clock.now().getTime();
    for (const session of Array.from(this.sessions.values())) {
      if (session.status === 'Active' && Date.parse(session.expiresAt) <= now) {
        session.status = 'Expired';
        session.endedAt = session.expiresAt;
      }
    }
  }

  listSessions(): Session[] {
    this.reconcileExpiredSessions();
    return Array.from(this.sessions.values()).sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  }

  restore(values: Iterable<Session | unknown[]>) {
    for (const value of Array.from(values)) {
      const session = Array.isArray(value) ? parseSessionRow(value) : value;
      if (session) this.sessions.set(session.id, session);
    }
    this.reconcileExpiredSessions();
  }

  replace(values: Iterable<Session | unknown[]>) {
    const cutoff = this.clock.now().getTime() - LOCAL_CHANGE_WINS_MS;
    for (const [id, changedAt] of Array.from(this.localChanges)) if (changedAt < cutoff) this.localChanges.delete(id);
    const recent = Array.from(this.localChanges.keys())
      .map(id => this.sessions.get(id))
      .filter((session): session is Session => session !== undefined);
    this.sessions.clear();
    this.restore(values);
    for (const session of recent) this.sessions.set(session.id, session);
    this.reconcileExpiredSessions();
  }

  private markLocalChange(id: string) {
    this.localChanges.set(id, this.clock.now().getTime());
  }

  private minutesUntilAbandoned(session: Session) {
    return Math.max(1, Math.ceil((this.lastSeenAt(session) + ABANDONED_AFTER_MS - this.clock.now().getTime()) / 60000));
  }

  private end(id: string, status: Exclude<SessionStatus, 'Active' | 'Expired'>, endedAt?: Date) {
    const session = this.get(id);
    if (session.status !== 'Active') return;
    session.status = status;
    session.endedAt = (endedAt ?? this.clock.now()).toISOString();
    this.markLocalChange(id);
  }
}

export function parseSessionRow(row: unknown[]): Session | null {
  if (row.length < 6) return null;
  const [id, machineId, userEmail, startedAt, expiresAt, status, endedAt, _action, zoneId, zoneName] = row.map(value => String(value ?? ''));
  if (!id || !machineId || !userEmail || !startedAt || !expiresAt || !statuses.has(status as SessionStatus)) return null;
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(expiresAt))) return null;
  return {
    id,
    machineId,
    userEmail,
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    status: status as SessionStatus,
    ...(zoneId ? { zoneId, zoneName } : {}),
    ...(endedAt && Number.isFinite(Date.parse(endedAt)) ? { endedAt: new Date(endedAt).toISOString() } : {}),
  };
}
