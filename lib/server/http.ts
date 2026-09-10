export function setCookie(name: string, value: string, options: { maxAge: number; secure: boolean; path?: string } = { maxAge: 0, secure: false }) {
  const attributes = [`${name}=${encodeURIComponent(value)}`, `Max-Age=${options.maxAge}`, `Path=${options.path ?? '/'}`, 'HttpOnly', 'SameSite=Lax'];
  if (options.secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function clearCookie(name: string, secure: boolean) {
  return setCookie(name, '', { maxAge: 0, secure });
}
