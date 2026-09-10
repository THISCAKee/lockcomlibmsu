import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AdminRecord, Session, SheetsConfig } from './types';
import type { SheetStore } from './store';
import { parseSessionRow } from './session-manager';
import { parseAdminRow } from './admin-registry';

type ServiceAccount = { client_email: string; private_key: string };
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class GoogleSheetsStore implements SheetStore {
  readonly name = 'google-sheets';
  private accessToken?: string;
  private tokenExpiresAt = 0;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: SheetsConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly credentialsOverride?: ServiceAccount,
  ) {}

  async loadSessions(): Promise<Session[]> {
    const response = await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(this.config.sessionsRange)}`,
      { headers: { authorization: `Bearer ${await this.getAccessToken()}` } },
    );
    const body = await response.json() as { values?: unknown[][] };
    return (body.values ?? []).map(parseSessionRow).filter((session): session is Session => session !== null);
  }

  async loadAdmins(): Promise<AdminRecord[]> {
    const response = await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(this.config.adminsRange ?? 'Admins!A:E')}`,
      { headers: { authorization: `Bearer ${await this.getAccessToken()}` } },
    );
    const body = await response.json() as { values?: unknown[][] };
    return (body.values ?? []).map(parseAdminRow).filter((admin): admin is AdminRecord => admin !== null);
  }

  appendSession(row: unknown[]) {
    return this.enqueueWrite(() => this.append(this.config.sessionsRange, row));
  }

  appendEvent(row: unknown[]) {
    return this.enqueueWrite(() => this.append(this.config.eventsRange, row));
  }

  appendAdmin(row: unknown[]) {
    return this.enqueueWrite(() => this.append(this.config.adminsRange ?? 'Admins!A:E', row));
  }

  private enqueueWrite(task: () => Promise<void>) {
    const next = this.writeTail.then(task, task);
    this.writeTail = next.then(() => undefined, () => undefined);
    return next;
  }

  private async append(range: string, row: unknown[]) {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.getAccessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ majorDimension: 'ROWS', values: [row] }),
      },
    );
  }

  private async request(input: string, init: RequestInit) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetchImpl(input, init);
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
        throw new Error(`Google Sheets request failed (${response.status}).`);
      }
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
    throw new Error('Google Sheets request failed.');
  }

  private async getAccessToken() {
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 60_000) return this.accessToken;
    const credentials = this.credentialsOverride ?? JSON.parse(await readFile(this.config.credentialsFile, 'utf8')) as ServiceAccount;
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const signature = base64Url(signer.sign(credentials.private_key.replaceAll('\\n', '\n')));
    const response = await this.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${payload}.${signature}`,
      }).toString(),
    });
    const token = await response.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token) throw new Error('Google token response was empty.');
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}

function base64Url(value: string | Uint8Array) {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
