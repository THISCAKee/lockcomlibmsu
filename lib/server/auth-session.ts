import { createHmac, timingSafeEqual } from 'node:crypto';

type AdminCookie = { email: string; expiresAt: string };

export function signAdminCookie(email: string, expiresAt: Date, secret: string) {
  const payload: AdminCookie = { email: email.trim(), expiresAt: expiresAt.toISOString() };
  const encoded = encode(payload);
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyAdminCookie(value: string | undefined, secret: string): AdminCookie | null {
  if (!value || !secret) return null;
  const [encoded, provided] = value.split('.');
  if (!encoded || !provided) return null;
  const expected = Buffer.from(signature(encoded, secret), 'base64url');
  const actual = Buffer.from(provided, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AdminCookie;
    if (!payload.email || !payload.expiresAt || Date.parse(payload.expiresAt) <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function encode(payload: AdminCookie) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function signature(encoded: string, secret: string) {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}
