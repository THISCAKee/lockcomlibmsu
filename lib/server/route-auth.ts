import { timingSafeEqual } from 'node:crypto';
import { verifyAdminCookie } from './auth-session';
import { isKnownMachine } from './config';
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
  return payload && state.admins.isAdmin(payload.email) ? payload.email : null;
}

export function clientEmail(request: Request, state: RuntimeState) {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  return state.clientTokens.find(authorization.slice(7).trim());
}

/** Machine identity for client-to-server calls that are not tied to a signed-in user. */
export function clientMachine(request: Request, state: RuntimeState) {
  const machineId = request.headers.get('X-Machine-Id')?.trim() ?? '';
  const clientKey = request.headers.get('X-Client-Key') ?? '';
  return isKnownMachine(machineId, state.config) && validClientKey(state.config.clientKey, clientKey) ? machineId : null;
}

function validClientKey(expected: string, provided: string) {
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const providedBytes = Buffer.from(provided, 'utf8');
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  return await request.json() as T;
}
