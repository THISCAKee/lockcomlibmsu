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

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly clock: Clock, private readonly sessionDurationMs: number) {}

  checkIn(machineId: string, userEmail: string): Session {
    const normalizedMachineId = machineId.trim();
    const normalizedEmail = userEmail.trim();
    if (!normalizedMachineId || !normalizedEmail) throw new TypeError('MachineId and userEmail are required.');

    this.reconcileExpiredSessions();
    if (Array.from(this.sessions.values()).some(session => session.status === 'Active' && session.machineId.toLowerCase() === normalizedMachineId.toLowerCase())) {
      throw new SessionConflictError('Machine is already in use.');
    }
    if (Array.from(this.sessions.values()).some(session => session.status === 'Active' && session.userEmail.toLowerCase() === normalizedEmail.toLowerCase())) {
      throw new SessionConflictError('User already has an active session.');
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
    return session;
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

  logout(id: string) {
    this.end(id, 'LoggedOut');
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
    this.sessions.clear();
    this.restore(values);
  }

  private end(id: string, status: Exclude<SessionStatus, 'Active' | 'Expired'>) {
    const session = this.get(id);
    if (session.status !== 'Active') return;
    session.status = status;
    session.endedAt = this.clock.now().toISOString();
  }
}

export function parseSessionRow(row: unknown[]): Session | null {
  if (row.length < 6) return null;
  const [id, machineId, userEmail, startedAt, expiresAt, status, endedAt] = row.map(value => String(value ?? ''));
  if (!id || !machineId || !userEmail || !startedAt || !expiresAt || !statuses.has(status as SessionStatus)) return null;
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(expiresAt))) return null;
  return {
    id,
    machineId,
    userEmail,
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    status: status as SessionStatus,
    ...(endedAt && Number.isFinite(Date.parse(endedAt)) ? { endedAt: new Date(endedAt).toISOString() } : {}),
  };
}
