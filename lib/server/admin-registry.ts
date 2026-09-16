import { isAllowedEmail } from './oauth';
import type { AdminRecord, AdminView } from './types';
import type { Clock } from './session-manager';

export class AdminConflictError extends Error {}
export class AdminPermissionError extends Error {}

export class AdminRegistry {
  private readonly admins = new Map<string, AdminRecord>();
  private readonly rootEmail: string;

  constructor(rootAdminEmail: string, private readonly allowedDomain: string, private readonly clock: Clock) {
    this.rootEmail = rootAdminEmail.trim().toLowerCase();
  }

  isRoot(email: string) {
    return email.trim().toLowerCase() === this.rootEmail;
  }

  isAdmin(email: string) {
    const normalized = email.trim().toLowerCase();
    return this.isRoot(normalized) || this.admins.has(normalized);
  }

  canManage(email: string) {
    return this.isRoot(email);
  }

  add(email: string, actor: string): AdminRecord {
    if (!this.canManage(actor)) throw new AdminPermissionError('Only the root Admin can manage Admin accounts.');
    const normalized = email.trim().toLowerCase();
    if (!isAllowedEmail(normalized, this.allowedDomain)) throw new TypeError('Only @msu.ac.th accounts can be Admins.');
    if (this.isAdmin(normalized)) throw new AdminConflictError('This account is already an Admin.');
    const record: AdminRecord = {
      email: normalized,
      role: 'admin',
      status: 'Active',
      addedBy: actor.trim().toLowerCase(),
      addedAt: this.clock.now().toISOString(),
    };
    this.admins.set(normalized, record);
    return record;
  }

  restore(values: Iterable<AdminRecord | unknown[]>) {
    for (const value of Array.from(values)) {
      const record = Array.isArray(value) ? parseAdminRow(value) : value;
      if (record && isAllowedEmail(record.email, this.allowedDomain) && !this.isRoot(record.email)) this.admins.set(record.email, record);
    }
  }

  replace(values: Iterable<AdminRecord | unknown[]>) {
    this.admins.clear();
    this.restore(values);
  }

  list(): AdminView[] {
    const root: AdminView = { email: this.rootEmail, role: 'root', status: 'Active' };
    const added = Array.from(this.admins.values())
      .sort((left, right) => left.email.localeCompare(right.email))
      .map(record => ({ email: record.email, role: 'admin' as const, status: record.status, addedBy: record.addedBy, addedAt: record.addedAt }));
    return [root, ...added];
  }
}

export function parseAdminRow(row: unknown[]): AdminRecord | null {
  if (row.length < 5) return null;
  const [email, role, status, addedBy, addedAt] = row.map(value => String(value ?? '').trim());
  if (!email || role.toLowerCase() !== 'admin' || status.toLowerCase() !== 'active' || !addedBy || !Number.isFinite(Date.parse(addedAt))) return null;
  return { email: email.toLowerCase(), role: 'admin', status: 'Active', addedBy: addedBy.toLowerCase(), addedAt: new Date(addedAt).toISOString() };
}
