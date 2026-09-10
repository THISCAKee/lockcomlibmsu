export type SessionStatus = 'Active' | 'LoggedOut' | 'Expired' | 'ForceLoggedOut';

export type Session = {
  id: string;
  machineId: string;
  userEmail: string;
  startedAt: string;
  expiresAt: string;
  status: SessionStatus;
  endedAt?: string;
};

export type OAuthConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  allowedEmailDomain: string;
};

export type SheetsConfig = {
  spreadsheetId: string;
  credentialsFile: string;
  sessionsRange: string;
  eventsRange: string;
};

export type ServerConfig = {
  sessionHours: number;
  machineCount: number;
  machinePrefix: string;
  adminEmails: string[];
  adminWebUrl: string;
  clientKey: string;
  authSecret: string;
  oauth: OAuthConfig;
  sheets: SheetsConfig;
};

export type MachineView = {
  machineId: string;
  name: string;
  status: 'Available' | 'InUse';
  userEmail?: string;
  expiresAt?: string;
  sessionId?: string;
  online: boolean;
  lastSeenAt?: string;
};

export type SessionView = {
  id: string;
  machineId: string;
  userEmail: string;
  startedAt: string;
  expiresAt: string;
  status: SessionStatus;
};

export type ClientTokenView = {
  token: string;
  userEmail: string;
  expiresAt: string;
};

export type RemoteCommandView = {
  id: string;
  type: 'shutdown';
};

export type ClientPollView = {
  online: boolean;
  command: RemoteCommandView | null;
};

export type MonthlyReportRow = {
  key: string;
  userEmail?: string;
  machineId?: string;
  sessionCount: number;
  hours: number;
};

export type MonthlyReportView = {
  month: string;
  rows: MonthlyReportRow[];
  totalHours: number;
};
