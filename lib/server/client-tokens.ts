import { randomBytes } from 'node:crypto';
import type { Clock } from './session-manager';
import type { ClientTokenView } from './types';

type StoredValue = { email: string; expiresAt: number };

export class OneTimeClientCodeStore {
  private readonly codes = new Map<string, StoredValue>();

  constructor(private readonly clock: Clock, private readonly ttlMs = 120_000) {}

  issue(email: string) {
    const code = randomBytes(24).toString('hex');
    this.codes.set(code, { email, expiresAt: this.clock.now().getTime() + this.ttlMs });
    return code;
  }

  redeem(code: string) {
    const value = this.codes.get(code);
    this.codes.delete(code);
    return value && value.expiresAt > this.clock.now().getTime() ? value.email : null;
  }
}

export class ClientTokenStore {
  private readonly tokens = new Map<string, StoredValue>();

  constructor(private readonly clock: Clock, private readonly ttlMs = 12 * 60 * 60 * 1000) {}

  issue(email: string): ClientTokenView {
    const token = randomBytes(32).toString('hex');
    const expiresAt = this.clock.now().getTime() + this.ttlMs;
    this.tokens.set(token, { email, expiresAt });
    return { token, userEmail: email, expiresAt: new Date(expiresAt).toISOString() };
  }

  find(token: string) {
    const value = this.tokens.get(token);
    if (!value || value.expiresAt <= this.clock.now().getTime()) {
      this.tokens.delete(token);
      return null;
    }
    return value.email;
  }
}
