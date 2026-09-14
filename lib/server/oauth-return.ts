export type OAuthReturn = '/admin' | '/admin/usage' | '/client';

const allowed = new Set<OAuthReturn>(['/admin', '/admin/usage', '/client']);

export function normalizeOAuthReturn(value: string | null): OAuthReturn {
  return value && allowed.has(value as OAuthReturn) ? value as OAuthReturn : '/client';
}

export function isAdminOAuthReturn(value: OAuthReturn) {
  return value === '/admin' || value === '/admin/usage';
}
