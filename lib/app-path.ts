export const APP_BASE_PATH = '/comlibmsu' as const;

export function appPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) return normalized;
  return `${APP_BASE_PATH}${normalized}`;
}
