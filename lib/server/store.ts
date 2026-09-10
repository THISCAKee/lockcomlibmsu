import type { AdminRecord, Session, ServerConfig } from './types';
import { parseSessionRow } from './session-manager';
import { parseAdminRow } from './admin-registry';
import { GoogleSheetsStore } from './google-sheets';

export interface SheetStore {
  readonly name: string;
  loadSessions(): Promise<Session[]>;
  loadAdmins(): Promise<AdminRecord[]>;
  appendSession(row: unknown[]): Promise<void>;
  appendEvent(row: unknown[]): Promise<void>;
  appendAdmin(row: unknown[]): Promise<void>;
}

export class InMemorySheetStore implements SheetStore {
  readonly name = 'in-memory';
  readonly sessionRows: unknown[][];
  readonly eventRows: unknown[][];
  readonly adminRows: unknown[][];

  constructor(sessionRows: unknown[][] = [], eventRows: unknown[][] = [], adminRows: unknown[][] = []) {
    this.sessionRows = sessionRows;
    this.eventRows = eventRows;
    this.adminRows = adminRows;
  }

  async loadSessions() {
    return this.sessionRows.map(parseSessionRow).filter((session): session is Session => session !== null);
  }

  async appendSession(row: unknown[]) {
    this.sessionRows.push(row);
  }

  async appendEvent(row: unknown[]) {
    this.eventRows.push(row);
  }

  async loadAdmins() {
    return this.adminRows.map(parseAdminRow).filter((admin): admin is AdminRecord => admin !== null);
  }

  async appendAdmin(row: unknown[]) {
    this.adminRows.push(row);
  }
}

export function createSheetStore(config: ServerConfig): SheetStore {
  return config.sheets.credentialsFile ? new GoogleSheetsStore(config.sheets) : new InMemorySheetStore();
}

export { GoogleSheetsStore };
