import type { Session, SessionView } from './types';

export function sessionView(session: Session): SessionView {
  return {
    id: session.id,
    machineId: session.machineId,
    userEmail: session.userEmail,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    status: session.status,
  };
}

export function sessionRow(session: Session, action: 'created' | 'updated') {
  return [
    session.id,
    session.machineId,
    session.userEmail,
    session.startedAt,
    session.expiresAt,
    session.status,
    session.endedAt ?? '',
    action,
  ];
}

export function eventRow(sessionId: string, machineId: string, actor: string, action: string, detail = '') {
  return [new Date().toISOString(), sessionId, machineId, actor, action, detail];
}

export function validMonth(value: string | null) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (year < 2000 || year > 9999) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
}

export function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
