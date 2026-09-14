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

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function browserNavigationResponse(location: string) {
  const destination = escapeHtmlAttribute(location);
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${destination}">
  <title>กำลังเข้าสู่ระบบ</title>
</head>
<body>
  <p>กำลังนำคุณไปยัง Google เพื่อเข้าสู่ระบบ...</p>
  <p><a href="${destination}">ดำเนินการต่อ</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}
