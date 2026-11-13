import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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

/**
 * Client bearer tokens are HMAC-signed rather than kept in memory, so they stay valid
 * across a server restart or redeploy and signed-in machines are not kicked out.
 */
export class ClientTokenStore {
  constructor(
    private readonly clock: Clock,
    private readonly ttlMs = 12 * 60 * 60 * 1000,
    private readonly secret: string = randomBytes(32).toString('hex'),
  ) {}

  issue(email: string): ClientTokenView {
    const expiresAt = this.clock.now().getTime() + this.ttlMs;
    const encoded = Buffer.from(JSON.stringify({ email, expiresAt, nonce: randomBytes(8).toString('hex') } satisfies StoredValue & { nonce: string }), 'utf8').toString('base64url');
    const token = `${encoded}.${this.signature(encoded)}`;
    return { token, userEmail: email, expiresAt: new Date(expiresAt).toISOString() };
  }

  find(token: string) {
    const [encoded, provided, extra] = token.split('.');
    if (!encoded || !provided || extra !== undefined) return null;
    const expected = Buffer.from(this.signature(encoded), 'base64url');
    const actual = Buffer.from(provided, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<StoredValue>;
      if (typeof value.email !== 'string' || typeof value.expiresAt !== 'number') return null;
      return value.expiresAt > this.clock.now().getTime() ? value.email : null;
    } catch {
      return null;
    }
  }

  private signature(encoded: string) {
    return createHmac('sha256', this.secret).update(`client-token:${encoded}`).digest('base64url');
  }
}
