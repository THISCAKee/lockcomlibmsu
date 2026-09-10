import type { Session, ServerConfig } from './types';
import { parseSessionRow } from './session-manager';
import { GoogleSheetsStore } from './google-sheets';

export interface SheetStore {
  readonly name: string;
  loadSessions(): Promise<Session[]>;
  appendSession(row: unknown[]): Promise<void>;
  appendEvent(row: unknown[]): Promise<void>;
}

export class InMemorySheetStore implements SheetStore {
  readonly name = 'in-memory';
  readonly sessionRows: unknown[][];
  readonly eventRows: unknown[][];

  constructor(sessionRows: unknown[][] = [], eventRows: unknown[][] = []) {
    this.sessionRows = sessionRows;
    this.eventRows = eventRows;
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
}

export function createSheetStore(config: ServerConfig): SheetStore {
  return config.sheets.credentialsFile ? new GoogleSheetsStore(config.sheets) : new InMemorySheetStore();
}

export { GoogleSheetsStore };
