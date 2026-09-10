import type { OAuthConfig, ServerConfig, SheetsConfig } from './types';

const defaultSpreadsheetId = '1eM1HT_PBI3Zt33R05l-3N9h9t45wFqXI8YinK65SNBU';
const defaultOAuthClientId = '854787076786-hlvo0jqsvtssm7lnjhlrh440hhiht3rl.apps.googleusercontent.com';

function firstEnvironmentValue(...names: string[]) {
  return names.map(name => process.env[name]?.trim()).find(value => value) ?? '';
}

function numberSetting(name: string, fallback: number) {
  const value = firstEnvironmentValue(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function requiredProductionValue(value: string, name: string) {
  if (process.env.NODE_ENV === 'production' && !value) throw new Error(`Missing required production environment variable: ${name}`);
  return value;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isKnownMachine(machineId: string, config: Pick<ServerConfig, 'machinePrefix' | 'machineCount'>) {
  const match = new RegExp(`^${escapeRegExp(config.machinePrefix)}(\\d{3})$`, 'i').exec(machineId.trim());
  const number = match ? Number(match[1]) : 0;
  return number >= 1 && number <= config.machineCount;
}

export function getServerConfig(): ServerConfig {
  const adminEmails = firstEnvironmentValue('LOCKCOMPUTER_ADMIN_EMAILS', 'LockComputer__AdminEmails__0')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  const oauth: OAuthConfig = {
    authorizationUrl: firstEnvironmentValue('OAUTH_AUTHORIZATION_URL', 'OAuth__AuthorizationUrl') || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: firstEnvironmentValue('OAUTH_TOKEN_URL', 'OAuth__TokenUrl') || 'https://oauth2.googleapis.com/token',
    userInfoUrl: firstEnvironmentValue('OAUTH_USER_INFO_URL', 'OAuth__UserInfoUrl') || 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientId: requiredProductionValue(firstEnvironmentValue('OAUTH_CLIENT_ID', 'OAuth__ClientId') || defaultOAuthClientId, 'OAUTH_CLIENT_ID'),
    clientSecret: requiredProductionValue(firstEnvironmentValue('OAUTH_CLIENT_SECRET', 'OAuth__ClientSecret'), 'OAUTH_CLIENT_SECRET'),
    redirectUri: requiredProductionValue(firstEnvironmentValue('OAUTH_REDIRECT_URI', 'OAuth__RedirectUri') || 'http://localhost:3000/auth/callback', 'OAUTH_REDIRECT_URI'),
    scope: firstEnvironmentValue('OAUTH_SCOPE', 'OAuth__Scope') || 'openid email profile',
    allowedEmailDomain: firstEnvironmentValue('OAUTH_ALLOWED_EMAIL_DOMAIN', 'OAuth__AllowedEmailDomain') || 'msu.ac.th',
  };

  const sheets: SheetsConfig = {
    spreadsheetId: requiredProductionValue(firstEnvironmentValue('GOOGLE_SHEETS_SPREADSHEET_ID', 'GoogleSheets__SpreadsheetId') || defaultSpreadsheetId, 'GOOGLE_SHEETS_SPREADSHEET_ID'),
    credentialsFile: requiredProductionValue(firstEnvironmentValue('GOOGLE_SHEETS_CREDENTIALS_FILE', 'GoogleSheets__CredentialsFile'), 'GOOGLE_SHEETS_CREDENTIALS_FILE'),
    sessionsRange: firstEnvironmentValue('GOOGLE_SHEETS_SESSIONS_RANGE', 'GoogleSheets__SessionsRange') || 'Sessions!A:H',
    eventsRange: firstEnvironmentValue('GOOGLE_SHEETS_EVENTS_RANGE', 'GoogleSheets__EventsRange') || 'Events!A:F',
  };

  const config: ServerConfig = {
    sessionHours: numberSetting('LOCKCOMPUTER_SESSION_HOURS', 3),
    machineCount: numberSetting('LOCKCOMPUTER_MACHINE_COUNT', 201),
    machinePrefix: firstEnvironmentValue('LOCKCOMPUTER_MACHINE_PREFIX') || 'PC-',
    adminEmails,
    adminWebUrl: firstEnvironmentValue('LOCKCOMPUTER_ADMIN_WEB_URL', 'LockComputer__AdminWebUrl') || 'http://localhost:3000',
    clientKey: requiredProductionValue(firstEnvironmentValue('LOCKCOMPUTER_CLIENT_KEY', 'LockComputer__ClientKey') || 'local-development-client-key', 'LOCKCOMPUTER_CLIENT_KEY'),
    authSecret: requiredProductionValue(firstEnvironmentValue('LOCKCOMPUTER_AUTH_SECRET') || 'local-development-auth-secret', 'LOCKCOMPUTER_AUTH_SECRET'),
    oauth,
    sheets,
  };

  if (config.machinePrefix !== 'PC-' || config.machineCount !== 201) {
    throw new Error('The LockComputer inventory must use machine IDs PC-001 through PC-201.');
  }
  if (process.env.NODE_ENV === 'production' && config.adminEmails.length === 0) {
    throw new Error('Missing required production environment variable: LOCKCOMPUTER_ADMIN_EMAILS');
  }
  return config;
}
