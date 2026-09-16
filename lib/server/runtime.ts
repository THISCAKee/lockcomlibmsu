import { createSheetStore, type SheetStore } from './store';
import { getServerConfig } from './config';
import { OneTimeClientCodeStore, ClientTokenStore } from './client-tokens';
import { PresenceRegistry } from './presence-registry';
import { SessionManager, type Clock } from './session-manager';
import { AdminRegistry } from './admin-registry';
import type { ServerConfig } from './types';

export type RuntimeState = {
  config: ServerConfig;
  store: SheetStore;
  clock: Clock;
  sessions: SessionManager;
  admins: AdminRegistry;
  presence: PresenceRegistry;
  clientCodes: OneTimeClientCodeStore;
  clientTokens: ClientTokenStore;
  refreshAdmins(): Promise<void>;
  refreshSessions(): Promise<void>;
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
  const admins = new AdminRegistry(config.rootAdminEmail, config.oauth.allowedEmailDomain, clock);

  let adminsRefresh: Promise<void> | undefined;
  const refreshAdmins = () => {
    adminsRefresh ??= store.loadAdmins()
      .then(values => admins.replace(values))
      .finally(() => { adminsRefresh = undefined; });
    return adminsRefresh;
  };

  let sessionsRefresh: Promise<void> | undefined;
  const refreshSessions = () => {
    sessionsRefresh ??= store.loadSessions()
      .then(values => sessions.replace(values))
      .finally(() => { sessionsRefresh = undefined; });
    return sessionsRefresh;
  };

  await Promise.all([refreshAdmins(), refreshSessions()]);
  return {
    config,
    store,
    clock,
    sessions,
    admins,
    presence: new PresenceRegistry(clock),
    clientCodes: new OneTimeClientCodeStore(clock),
    clientTokens: new ClientTokenStore(clock),
    refreshAdmins,
    refreshSessions,
  };
}
