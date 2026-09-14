import { APP_BASE_PATH } from '../app-path';

export function setCookie(name: string, value: string, options: { maxAge: number; secure: boolean; path?: string } = { maxAge: 0, secure: false }) {
  const attributes = [`${name}=${encodeURIComponent(value)}`, `Max-Age=${options.maxAge}`, `Path=${options.path ?? APP_BASE_PATH}`, 'HttpOnly', 'SameSite=Lax'];
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearCookie(name: string, secure: boolean) {
  return setCookie(name, '', { maxAge: 0, secure, path: APP_BASE_PATH });
}

export function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')
    ?.split(',', 1)[0]
    .trim()
    .toLowerCase();
  return new URL(request.url).protocol === 'https:' || forwardedProtocol === 'https';
}

export function redirectResponse(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}
