# Next.js Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the LockComputer API into the existing Next.js application so the Admin UI, Client API, Google Sheets integration, OAuth flow, session lifecycle, and remote-shutdown broker run as one Node.js service on Windows Server.

**Architecture:** Implement the existing ASP.NET endpoints as Node.js Route Handlers under `app/api` and `app/auth`, with server-only TypeScript modules under `lib/server`. Use Google Sheets as the durable session/event store and a process-local session/presence/command registry in a single long-lived Node.js process. Keep the existing WPF request/response contracts and use relative Admin API calls after removing the old ASP.NET proxy rewrites.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node.js runtime, Node built-in `crypto`/`fetch`/`fs`, Google Sheets REST API, Google OAuth-compatible HTTP endpoints, `node:test`, `tsx`, Windows Server Node service.

**Spec:** `docs/superpowers/specs/2026-09-10-nextjs-backend-migration-design.md`

## Global Constraints

- Use one long-lived Next.js Node.js process on Windows Server; do not use Vercel Serverless Functions for the live command broker.
- Do not add Supabase, Redis, SQL databases, or any other external live-state database.
- Keep Google Sheets tabs and row shapes: `Sessions!A:H` and `Events!A:F`.
- Keep the API routes and response fields required by the WPF Client and Admin UI.
- Allow only `@msu.ac.th` accounts and configured Admin emails.
- Accept only known machines `PC-001` through `PC-201` by default.
- Mark a Client Online for 30 seconds after its last accepted poll and poll every 10 seconds.
- Never queue a shutdown for an offline machine and never accept more than one pending command per machine.
- Never write a Google Sheets row for each presence poll.
- Never expose OAuth secrets, service-account credentials, ClientKey, bearer tokens, or cookie contents.
- Never execute a shutdown command during automated tests or smoke tests.
- Do not delete the ASP.NET project until the Next.js migration has passed manual cutover verification.

---

### Task 1: Add a TypeScript test runner and server module boundaries

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/server/types.ts`
- Create: `lib/server/config.ts`
- Create: `tests/server-config.test.ts`
- Modify: `tests/admin-contract.test.mjs`

**Interfaces:**
- `ServerConfig` contains `sessionHours`, `machineCount`, `machinePrefix`, `adminEmails`, `adminWebUrl`, `clientKey`, `authSecret`, `oauth`, and `sheets` values.
- `getServerConfig(): ServerConfig` reads only server-side environment variables and rejects missing production secrets with a descriptive startup error.
- `isKnownMachine(machineId: string, config: ServerConfig): boolean` accepts exactly the configured prefix plus a three-digit number from 001 through the configured count.
- `MachineView`, `SessionView`, `ClientTokenView`, `RemoteCommandView`, `ClientPollView`, and `MonthlyReportView` are TypeScript types matching the current JSON contracts.

- [ ] **Step 1: Write the failing configuration tests**

Add `tests/server-config.test.ts` using `node:test` and `assert/strict`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownMachine } from '../lib/server/config';

test('accepts only the configured 201-machine inventory', () => {
  const config = { machinePrefix: 'PC-', machineCount: 201 } as Parameters<typeof isKnownMachine>[1];
  assert.equal(isKnownMachine('PC-001', config), true);
  assert.equal(isKnownMachine('PC-201', config), true);
  assert.equal(isKnownMachine('PC-000', config), false);
  assert.equal(isKnownMachine('PC-202', config), false);
  assert.equal(isKnownMachine('PC-1', config), false);
  assert.equal(isKnownMachine('PC-201x', config), false);
});
```

Add a source contract in `tests/admin-contract.test.mjs` requiring `lib/server/config.ts`, `getServerConfig`, and `isKnownMachine`.

- [ ] **Step 2: Run the new focused test to verify it fails**

Run from `apps/admin-next`:

```powershell
npx tsx --test tests/server-config.test.ts
```

Expected: module-not-found or missing-export failure because the server module does not exist.

- [ ] **Step 3: Add the minimal server types and configuration module**

Create `lib/server/types.ts` with the contract types and create `lib/server/config.ts` with:

```ts
export function isKnownMachine(machineId: string, config: Pick<ServerConfig, 'machinePrefix' | 'machineCount'>) {
  const match = new RegExp(`^${escapeRegExp(config.machinePrefix)}(\\d{3})$`, 'i').exec(machineId.trim());
  const number = match ? Number(match[1]) : 0;
  return number >= 1 && number <= config.machineCount;
}
```

`getServerConfig()` parses comma-separated `LOCKCOMPUTER_ADMIN_EMAILS`, integer settings, OAuth URLs, Sheets ranges, and the credential-file path. It uses development defaults only when `NODE_ENV !== 'production'`; production requires non-empty `LOCKCOMPUTER_AUTH_SECRET`, `LOCKCOMPUTER_CLIENT_KEY`, OAuth client secret, OAuth redirect URI, and Sheets credential settings.

Change `package.json` to add `"test:server": "tsx --test tests/server-config.test.ts"` and make `"dev": "next dev -p 3000"` the local development command. Add `tsx` as a dev dependency and regenerate `package-lock.json` with `npm install`.

- [ ] **Step 4: Run the focused test and existing Admin tests**

Run:

```powershell
npx tsx --test tests/server-config.test.ts
npm test
```

Expected: the new inventory test and all existing Admin tests pass.

- [ ] **Step 5: Commit the module boundary**

```powershell
git add package.json package-lock.json lib/server/types.ts lib/server/config.ts tests/server-config.test.ts tests/admin-contract.test.mjs
git commit -m "feat: add Next.js server module boundaries"
```

### Task 2: Port session, presence, and report domain logic

**Files:**
- Create: `lib/server/session-manager.ts`
- Create: `lib/server/presence-registry.ts`
- Create: `lib/server/monthly-report.ts`
- Create: `tests/session-manager.test.ts`
- Create: `tests/presence-registry.test.ts`
- Create: `tests/monthly-report.test.ts`

**Interfaces:**
- `SessionManager(clock: Clock, durationMs: number)` exposes `checkIn`, `get`, `getActiveForMachine`, `logout`, `forceLogout`, `reconcileExpiredSessions`, `listSessions`, and `restore`.
- `PresenceRegistry(clock: Clock, onlineWindowMs = 30_000)` exposes `poll`, `getSnapshot`, `canQueueShutdown`, and `tryQueueShutdown`.
- `MonthlyReportBuilder.build(sessions, month)` returns `{ month, rows, totalHours }` with the same grouping and duration rules as the existing Core project.

- [ ] **Step 1: Write failing domain tests**

Create tests that cover:

```ts
test('rejects duplicate machine and user sessions');
test('expires a session after its configured duration');
test('force logout marks an active session and sets endedAt');
test('restores session rows and ignores malformed rows');
test('registers a Client online and accepts one shutdown command');
test('rejects duplicate shutdown commands and offline machines');
test('poll consumes a shutdown command exactly once');
test('groups overlapping sessions by month, user, and machine');
```

Use a deterministic `ManualClock` in `tests/test-clock.ts` so no test depends on wall-clock timing.

- [ ] **Step 2: Run the focused domain tests to verify they fail**

Run:

```powershell
npx tsx --test tests/session-manager.test.ts tests/presence-registry.test.ts tests/monthly-report.test.ts
```

Expected: module-not-found failures for the new server modules.

- [ ] **Step 3: Implement the minimal domain modules**

Port the existing behavior from `src/LockComputer.Core/SessionManager.cs`, `Session.cs`, `MonthlyReport.cs`, and `src/LockComputer.Server/RemoteCommands.cs` into TypeScript. Keep `SessionStatus` values `Active`, `LoggedOut`, `Expired`, and `ForceLoggedOut`. Guard mutable maps with synchronous code because all access occurs within one Node.js event loop. Have `PresenceRegistry.poll()` update `lastSeenAt`, return one pending command, and clear it atomically within the method.

- [ ] **Step 4: Run all focused domain tests**

Run the same `npx tsx --test` command. Expected: all domain tests pass with no shutdown process invocation.

- [ ] **Step 5: Commit the domain modules**

```powershell
git add lib/server/session-manager.ts lib/server/presence-registry.ts lib/server/monthly-report.ts tests/test-clock.ts tests/session-manager.test.ts tests/presence-registry.test.ts tests/monthly-report.test.ts
git commit -m "feat: port session and presence domain logic"
```

### Task 3: Implement Google Sheets storage and configuration loading

**Files:**
- Create: `lib/server/google-sheets.ts`
- Create: `lib/server/store.ts`
- Create: `tests/google-sheets.test.ts`
- Modify: `.env.example`
- Modify: `tests/admin-contract.test.mjs`

**Interfaces:**
- `SheetStore` exposes `name`, `loadSessions()`, `appendSession(row)`, and `appendEvent(row)`.
- `InMemorySheetStore` stores rows in arrays for tests.
- `GoogleSheetsStore` reads and appends through the Sheets REST API using a service-account JWT generated with Node `crypto`.
- `createSheetStore(config): SheetStore` returns the in-memory store for development without credentials and Google Sheets for configured deployments.

- [ ] **Step 1: Write failing storage tests**

Create tests that use a fake `fetch` implementation and assert:

```ts
test('in-memory store restores valid session rows and ignores invalid rows');
test('Google Sheets store loads Sessions!A:H with a bearer token');
test('Google Sheets store appends lifecycle rows serially');
test('Google Sheets errors are surfaced without returning a successful write');
test('service-account credentials are never included in an error message');
```

Add a source contract requiring `Sessions!A:H`, `Events!A:F`, `GoogleSheetsStore`, and `createSheetStore`.

- [ ] **Step 2: Run storage tests to verify they fail**

Run:

```powershell
npx tsx --test tests/google-sheets.test.ts
```

Expected: missing-module failures.

- [ ] **Step 3: Implement the Sheets adapter**

Port the current REST flow from `src/LockComputer.Server/SheetStore.cs`:

1. Read the service-account JSON from the configured server-only path.
2. Create a one-hour RS256 JWT for `https://www.googleapis.com/auth/spreadsheets`.
3. Exchange it at `https://oauth2.googleapis.com/token` and cache the access token until one minute before expiry.
4. Read the configured sessions range and parse rows into `Session` objects.
5. Append session/event rows with `valueInputOption=USER_ENTERED` and `insertDataOption=INSERT_ROWS`.
6. Serialize writes through a promise queue and retry transient 429/5xx responses with capped exponential backoff.

Create `.env.example` with variable names and safe empty values only. Do not copy `.env.local` into the repository.

- [ ] **Step 4: Run storage tests and TypeScript checking**

Run:

```powershell
npx tsx --test tests/google-sheets.test.ts
npx tsc --noEmit
```

Expected: all storage tests and TypeScript checks pass.

- [ ] **Step 5: Commit the Sheets adapter**

```powershell
git add lib/server/google-sheets.ts lib/server/store.ts tests/google-sheets.test.ts .env.example tests/admin-contract.test.mjs
git commit -m "feat: add Next.js Google Sheets store"
```

### Task 4: Port OAuth, Admin cookies, and Client tokens

**Files:**
- Create: `lib/server/oauth.ts`
- Create: `lib/server/auth-session.ts`
- Create: `lib/server/client-tokens.ts`
- Create: `tests/oauth.test.ts`
- Create: `tests/auth-session.test.ts`
- Create: `tests/client-tokens.test.ts`

**Interfaces:**
- `createAuthorizationUrl(config, state, returnUrl): string`.
- `exchangeCodeForEmail(config, code, signal): Promise<string>`.
- `signAdminCookie(email, expiresAt, secret): string` and `verifyAdminCookie(value, secret): { email, expiresAt } | null`.
- `OneTimeClientCodeStore.issue(email)` and `.redeem(code)`.
- `ClientTokenStore.issue(email)` and `.find(token)`.
- `isAllowedEmail(email, domain): boolean`.

- [ ] **Step 1: Write failing authentication tests**

Cover:

```ts
test('authorization URL includes select_account and the allowed hosted domain');
test('OAuth exchange sends client secret only to the configured token endpoint');
test('provider error exposes safe error and not response secrets');
test('email policy accepts exactly one @msu.ac.th suffix');
test('admin cookie rejects tampering and expired payloads');
test('one-time Client code can be redeemed only once');
test('Client bearer tokens expire and are not logged');
```

- [ ] **Step 2: Run authentication tests to verify they fail**

```powershell
npx tsx --test tests/oauth.test.ts tests/auth-session.test.ts tests/client-tokens.test.ts
```

Expected: missing-module failures.

- [ ] **Step 3: Implement authentication modules**

Port the configured OAuth provider flow from `src/LockComputer.Server/Auth.cs`. Use `crypto.randomBytes` for state/codes/tokens, `crypto.createHmac('sha256', secret)` for the Admin cookie, and `crypto.timingSafeEqual` for signatures after checking equal lengths. Set cookie attributes `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when running over HTTPS. Keep the Admin cookie signed and durable across process restarts; keep Client exchange codes and bearer tokens process-local.

- [ ] **Step 4: Run authentication tests and TypeScript checking**

```powershell
npx tsx --test tests/oauth.test.ts tests/auth-session.test.ts tests/client-tokens.test.ts
npx tsc --noEmit
```

Expected: all tests pass.

- [ ] **Step 5: Commit authentication modules**

```powershell
git add lib/server/oauth.ts lib/server/auth-session.ts lib/server/client-tokens.ts tests/oauth.test.ts tests/auth-session.test.ts tests/client-tokens.test.ts
git commit -m "feat: add Next.js OAuth and session authentication"
```

### Task 5: Add shared runtime state and API Route Handlers

**Files:**
- Create: `lib/server/runtime.ts`
- Create: `lib/server/route-auth.ts`
- Create: `app/auth/login/route.ts`
- Create: `app/auth/callback/route.ts`
- Create: `app/api/health/route.ts`
- Create: `app/api/me/route.ts`
- Create: `app/api/auth/client-exchange/route.ts`
- Create: `app/api/client/poll/route.ts`
- Create: `app/api/machines/route.ts`
- Create: `app/api/sessions/check-in/route.ts`
- Create: `app/api/sessions/[id]/heartbeat/route.ts`
- Create: `app/api/sessions/[id]/logout/route.ts`
- Create: `app/api/admin/sessions/[id]/force-logout/route.ts`
- Create: `app/api/admin/machines/[machineId]/shutdown/route.ts`
- Create: `app/api/admin/reports/monthly/route.ts`
- Create: `app/api/admin/export/monthly.csv/route.ts`
- Create: `tests/routes-contract.test.ts`
- Modify: `tests/admin-contract.test.mjs`

**Interfaces:**
- `runtime.ts` exports a single process-level `runtime` containing `config`, `store`, `sessions`, `presence`, and token/code stores.
- Every Route Handler exports `runtime = 'nodejs'` and uses `NextRequest`/`NextResponse` or the Web Request/Response API.
- Route response JSON matches the current ASP.NET API contracts.

- [ ] **Step 1: Write failing route contract tests**

Create route tests that call handlers with `Request` objects and assert:

```ts
test('health returns the configured store name');
test('client poll requires both machine headers and consumes one command');
test('machines returns 201 inventory with online and lastSeenAt');
test('check-in, heartbeat, logout, and force-logout preserve status contracts');
test('admin shutdown rejects unauthenticated, unknown, offline, and duplicate targets');
test('admin shutdown force-logs out active sessions before queueing');
test('shutdown request and dispatch append the expected Events rows');
test('monthly report JSON and CSV require Admin authorization');
```

Add source assertions for every route path listed in the design spec and for `runtime = 'nodejs'`.

- [ ] **Step 2: Run route tests to verify they fail**

```powershell
npx tsx --test tests/routes-contract.test.ts
```

Expected: missing Route Handler failures.

- [ ] **Step 3: Implement runtime and route helpers**

Create `runtime.ts` with module-level lazy initialization. On first use, load sessions once from `SheetStore` and restore them into `SessionManager`; retain the initialization promise so concurrent first requests do not restore twice. Create `route-auth.ts` helpers for Admin cookie email, Client bearer email, JSON errors, and machine header validation.

- [ ] **Step 4: Implement the health, OAuth, and Client routes**

Implement:

- `/api/health` with `{ status: 'ok', store, utc }`.
- `/auth/login` with secure random state, return URL cookie, and redirect to the configured provider.
- `/auth/callback` with state validation, provider exchange, domain enforcement, Admin cookie sign-in, or one-time Client code redirect.
- `/api/auth/client-exchange` with one-time code redemption and Client token issuance.
- `/api/client/poll` with exact machine/key validation, presence update, one-command dispatch, and `shutdown-dispatched` event.

- [ ] **Step 5: Implement machine, session, Admin action, and report routes**

Implement the remaining routes with the existing status codes and rows. For Admin shutdown, authorize the Admin email, validate `PC-001` through `PC-201`, reject offline/duplicate targets with 409, force-log out active sessions, append `shutdown-requested`, queue the command, and return 202. Use `Date.now()`/UTC ISO strings consistently in JSON and Sheets rows.

- [ ] **Step 6: Run route tests and all server-side tests**

```powershell
npx tsx --test tests/server-config.test.ts tests/session-manager.test.ts tests/presence-registry.test.ts tests/monthly-report.test.ts tests/google-sheets.test.ts tests/oauth.test.ts tests/auth-session.test.ts tests/client-tokens.test.ts tests/routes-contract.test.ts
npm test
npx tsc --noEmit
```

Expected: all route/domain/storage/auth tests, existing Admin tests, and TypeScript checking pass. No test starts `shutdown.exe`.

- [ ] **Step 7: Commit the Route Handlers**

```powershell
git add lib/server/runtime.ts lib/server/route-auth.ts app/auth app/api tests/routes-contract.test.ts tests/admin-contract.test.mjs
git commit -m "feat: add Next.js LockComputer API routes"
```

### Task 6: Remove the ASP.NET proxy path and switch local Client/API configuration

**Files:**
- Modify: `next.config.mjs`
- Delete: `scripts/dev.mjs`
- Modify: `package.json`
- Modify: `tests/dev-launcher.test.mjs`
- Modify: `src/LockComputer.Client/clientsettings.json`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- `npm run dev` starts only `next dev -p 3000`.
- Admin browser requests remain relative (`/api/...`, `/auth/...`) and no longer use `LOCKCOMPUTER_SERVER_URL` rewrites.
- Local WPF Client uses `http://localhost:3000`; production Client uses the Windows Server HTTPS URL.

- [ ] **Step 1: Write the failing local-runtime contract test**

Update `tests/dev-launcher.test.mjs` to assert `package.json` has `"dev": "next dev -p 3000"`, `next.config.mjs` contains no `LOCKCOMPUTER_SERVER_URL` rewrite, and `clientsettings.json` uses port 3000 for local development. Run:

```powershell
npm test
```

Expected: the launcher contract fails because the old combined launcher and proxy are still present.

- [ ] **Step 2: Implement the local-runtime cutover**

Remove the old proxy rewrites from `next.config.mjs`, delete `scripts/dev.mjs`, set the `dev` script to `next dev -p 3000`, and update the launcher test. Change only the development Client URL in the repository config; production deployment values remain environment/configuration inputs.

- [ ] **Step 3: Run local-runtime tests and build**

```powershell
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests and the Next.js build pass.

- [ ] **Step 4: Commit the local cutover**

```powershell
git add next.config.mjs package.json tests/dev-launcher.test.mjs src/LockComputer.Client/clientsettings.json README.md .env.example
git rm scripts/dev.mjs
git commit -m "feat: run LockComputer API from Next.js"
```

### Task 7: Verify safe integration, document Windows Server deployment, and prepare cutover

**Files:**
- Modify: `README.md`
- Create: `scripts/start-production.ps1`
- Create: `scripts/install-next-service.ps1`
- Create: `tests/production-deployment.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- `scripts/start-production.ps1` validates required environment variables and starts `npm run start -- -p 3000` without printing secret values.
- `scripts/install-next-service.ps1` documents/automates registering the built Next.js process as a Windows service using an explicit service account and working directory.
- Production health and Client poll smoke tests use a valid known machine and never enqueue a shutdown.

- [ ] **Step 1: Write failing deployment contract tests**

Assert that deployment docs/scripts contain:

```text
next build
npm run start
LOCKCOMPUTER_AUTH_SECRET
LOCKCOMPUTER_CLIENT_KEY
GOOGLE_SHEETS_CREDENTIALS_FILE
OAUTH_REDIRECT_URI
https://
```

Assert that `.gitignore` excludes `.env*`, `node_modules/`, `.next/`, and credential files. Run:

```powershell
node tests/production-deployment.test.mjs
```

Expected: failure because the production startup/service scripts and deployment section are absent.

- [ ] **Step 2: Implement deployment helpers and documentation**

Document this Windows Server sequence:

```powershell
npm ci
npm run build
.\scripts\start-production.ps1
```

The IIS/Windows service setup must use a single Node.js process, expose HTTPS publicly, protect the service-account file outside the web root, set the OAuth callback to the Next.js public URL, set `LOCKCOMPUTER_ADMIN_WEB_URL` to the same public URL, and set every Client `ServerBaseUrl` to that URL. The helper must fail fast if any required production environment variable is missing and must not print values.

- [ ] **Step 3: Run the safe local smoke test**

Start the built Next.js service with the development in-memory store, then verify:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod -Method Post http://localhost:3000/api/client/poll -Headers @{
  'X-Machine-Id' = 'PC-001'
  'X-Client-Key' = $env:LOCKCOMPUTER_CLIENT_KEY
}
```

Expected: health is `ok`, the store name is correct for the selected environment, and poll returns `online: true` with `command: null`. Do not call the Admin shutdown endpoint.

- [ ] **Step 4: Run the complete verification suite**

```powershell
npm test
npx tsc --noEmit
npm run build
node tests/production-deployment.test.mjs
```

Expected: all tests and the production build pass with no secret values in output.

- [ ] **Step 5: Commit the deployment preparation**

```powershell
git add README.md scripts/start-production.ps1 scripts/install-next-service.ps1 tests/production-deployment.test.mjs .gitignore
git commit -m "docs: prepare Next.js Windows deployment"
```

- [ ] **Step 6: Manual cutover checklist**

1. Deploy the built Next.js app to a Windows Server Node service.
2. Set the production environment variables and restart the service.
3. Verify `/api/health` reports `google-sheets`.
4. Test Google OAuth with one Admin account and one disposable Client.
5. Verify Client Online status, check-in, heartbeat, logout, monthly report, and Events rows.
6. Test Remote Shutdown once on the disposable Client and verify both audit events.
7. Roll out the production Client URL and unique `MachineId` values to the remaining 200 machines.
8. Keep the ASP.NET deployment available as rollback until the operator signs off.
