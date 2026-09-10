import { createSheetStore, type SheetStore } from './store';
import { getServerConfig } from './config';
import { OneTimeClientCodeStore, ClientTokenStore } from './client-tokens';
import { PresenceRegistry } from './presence-registry';
import { SessionManager, type Clock } from './session-manager';
import type { ServerConfig } from './types';

export type RuntimeState = {
  config: ServerConfig;
  store: SheetStore;
  clock: Clock;
  sessions: SessionManager;
  presence: PresenceRegistry;
  clientCodes: OneTimeClientCodeStore;
  clientTokens: ClientTokenStore;
};

let statePromise: Promise<RuntimeState> | undefined;

export async function runtime(): Promise<RuntimeState> {
  statePromise ??= initializeRuntime();
  return statePromise;
}

export function resetRuntimeForTests() {
  statePromise = undefined;
}

async function initializeRuntime(): Promise<RuntimeState> {
  const config = getServerConfig();
  const clock: Clock = { now: () => new Date() };
  const store = createSheetStore(config);
  const sessions = new SessionManager(clock, config.sessionHours * 60 * 60 * 1000);
  sessions.restore(await store.loadSessions());
  return {
    config,
    store,
    clock,
    sessions,
    presence: new PresenceRegistry(clock),
    clientCodes: new OneTimeClientCodeStore(clock),
    clientTokens: new ClientTokenStore(clock),
  };
}
