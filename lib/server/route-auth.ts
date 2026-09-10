import { verifyAdminCookie } from './auth-session';
import type { RuntimeState } from './runtime';

export function cookieValue(request: Request, name: string) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function adminEmail(request: Request, state: RuntimeState) {
  const payload = verifyAdminCookie(cookieValue(request, 'lockcomputer_admin'), state.config.authSecret);
  return payload && state.config.adminEmails.includes(payload.email.toLowerCase()) ? payload.email : null;
}

export function clientEmail(request: Request, state: RuntimeState) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  return state.clientTokens.find(authorization.slice(7).trim());
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return await request.json() as T;
}
