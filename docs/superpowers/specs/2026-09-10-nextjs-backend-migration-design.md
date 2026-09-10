# Next.js Backend Migration Design

## Goal

Move the LockComputer API from ASP.NET Core into the existing Next.js Admin application so that the Admin UI and API run as one Node.js service on a Windows Server. Continue using the existing Google Sheets workbook for session history, monthly reporting, and audit events. The WPF Client must continue to support MSU OAuth, session lifecycle, presence polling, and remote shutdown without an API contract break.

## Decision

Use Next.js App Router Route Handlers with the Node.js runtime as the only production application process. The application will run as one long-lived Node.js process on Windows Server; it will not rely on Vercel Serverless Functions for the live command broker. Google Sheets remains the durable store for session and event rows. Short-lived presence and one-command remote-shutdown state remains in process memory, matching the existing ASP.NET behavior.

The existing ASP.NET Server remains untouched during the migration as a compatibility reference and local fallback. It is removed from the normal `npm run dev` and production startup path only after the Next.js routes pass the integration checks.

## Scope

### Next.js responsibilities

- Serve the existing Admin Dashboard at `/admin`.
- Implement the existing OAuth login and callback flow.
- Restrict authenticated user login to `@msu.ac.th`.
- Issue and validate the Admin cookie and Client bearer tokens.
- Implement Client check-in, heartbeat, logout, and Admin force-logout.
- Load and append session history through Google Sheets.
- Expose machine inventory `PC-001` through `PC-201`.
- Track Client presence for a 30-second online window.
- Queue one shutdown command for an online machine and dispatch it on the next Client poll.
- Write `shutdown-requested` and `shutdown-dispatched` audit events.
- Provide monthly report JSON and CSV endpoints.
- Provide `/api/health` with the active store name.

### Non-goals

- No Supabase, Redis, SQL database, WebSocket server, or Vercel-only deployment.
- No change to the Client's fixed `shutdown.exe /s /t 0` behavior.
- No persistent shutdown queue for machines that are offline.
- No change to the Google Sheets tab names or existing row shapes.
- No automatic remote shutdown during tests.

## Runtime and deployment model

The production topology is:

```text
Windows Server
└── one Next.js Node.js process on HTTPS/public API URL
    ├── Admin UI
    ├── Route Handlers
    ├── in-memory presence and command broker
    └── Google Sheets adapter
```

The service must run as one process without Node.js cluster mode. If the process restarts, presence records, pending remote commands, and Client bearer tokens are cleared. Session rows are restored from Google Sheets during startup. Admin cookies remain valid across restarts because they are signed with a stable secret.

Local development uses `npm run dev` for Next.js only. The local Client points to `http://localhost:3000`. Production Clients point to the Windows Server HTTPS URL.

## API contract

The following routes remain available with the existing request and response shapes so the WPF Client and Admin UI need minimal changes:

| Route | Method | Purpose |
|---|---:|---|
| `/auth/login` | GET | Begin Google/MSU OAuth and store signed state cookie |
| `/auth/callback` | GET | Exchange provider code, enforce domain, redirect Client/Admin |
| `/api/auth/client-exchange` | POST | Exchange one-time Client code for bearer token |
| `/api/health` | GET | Return service and store health |
| `/api/me` | GET | Return authenticated Admin identity |
| `/api/client/poll` | POST | Authenticate Client, update presence, dispatch one command |
| `/api/machines` | GET | Return 201 machine views and presence fields |
| `/api/sessions/check-in` | POST | Create a three-hour active session |
| `/api/sessions/{id}/heartbeat` | POST | Validate and refresh active Client session |
| `/api/sessions/{id}/logout` | POST | End the authenticated Client session |
| `/api/admin/sessions/{id}/force-logout` | POST | End a session as an Admin |
| `/api/admin/machines/{machineId}/shutdown` | POST | Queue shutdown for an online machine |
| `/api/admin/reports/monthly` | GET | Return the selected monthly report |
| `/api/admin/export/monthly.csv` | GET | Export the selected monthly report |

`POST /api/client/poll` continues to require `X-Machine-Id` and `X-Client-Key`. `POST /api/admin/machines/{machineId}/shutdown` continues to require the signed Admin cookie. Unauthorized Clients receive 401; unauthorized Admins receive 401/403 according to the existing cookie flow; unknown machines return 404; offline or duplicate shutdown requests return 409.

## Authentication and security

Use Node.js cryptography in a dedicated server-only module:

- Generate OAuth state with cryptographically secure random bytes.
- Store OAuth state and return URL in HttpOnly, SameSite=Lax cookies.
- Enforce the configured email domain after the provider user-info response.
- Sign the Admin session cookie with HMAC-SHA256 using `LOCKCOMPUTER_AUTH_SECRET`.
- Store only the Admin email and expiry in the signed cookie.
- Store Client bearer tokens in the process-local token store with expiry and email.
- Compare `X-Client-Key` with `timingSafeEqual` only after equal-length buffers are prepared.
- Never return or log OAuth secrets, service-account credentials, ClientKey, bearer tokens, or cookie contents.
- Keep all Google credentials and secrets in Windows service environment variables or a protected file outside the web root.

The Client accepts only a command whose type is exactly `shutdown`, and the local process invocation remains fixed in the WPF project.

## Google Sheets adapter

Implement a server-only Google Sheets module with the existing workbook ID and ranges:

- Read `Sessions!A:H` during startup.
- Append session rows for `created` and `updated` lifecycle events.
- Append event rows to `Events!A:F`.
- Keep the monthly report calculation in TypeScript over the restored session model.
- Use one service-account credential source configured by environment variable.
- Use bounded retries with exponential backoff for transient Google API failures.
- Do not write a row for every Client presence poll; presence remains in memory to avoid Sheets API quota pressure.

The adapter exposes a small interface so tests can use an in-memory implementation without contacting Google.

## Session and presence state

Port the existing Core behavior into focused TypeScript server modules:

- `SessionManager` keeps active and completed sessions, rejects duplicate active check-ins, expires sessions, and supports force logout.
- `PresenceRegistry` records the last accepted poll for known machines and stores at most one pending command per machine.
- A machine is online when its last poll is no more than 30 seconds old.
- A successful Client poll consumes its pending command exactly once.
- The inventory is generated from `LOCKCOMPUTER_MACHINE_PREFIX`, default `PC-`, and `LOCKCOMPUTER_MACHINE_COUNT`, default `201`.

The Admin machine response keeps `status`, `userEmail`, `expiresAt`, and `sessionId`, and adds `online` and `lastSeenAt`.

## Remote shutdown flow

1. Client polls every 10 seconds from the Login or Session screen.
2. Next.js validates the machine ID and shared ClientKey, then updates presence.
3. Admin selects an Online machine and confirms the browser dialog.
4. Next.js validates Admin authorization and current presence.
5. If a session is active, Next.js force-logs it out and appends the updated session and `force-logout` event.
6. Next.js appends `shutdown-requested` and stores one fixed `shutdown` command.
7. The next accepted poll appends `shutdown-dispatched` and returns the command.
8. WPF invokes fixed `shutdown.exe /s /t 0` and closes its window.

Google Sheets failures prevent a request from being reported as accepted. Network failures during Client polling do not log the user out; the Client retries on the next interval.

## Configuration

The Next.js service will read these server-only variables:

```text
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_CREDENTIALS_FILE
OAUTH_AUTHORIZATION_URL
OAUTH_TOKEN_URL
OAUTH_USER_INFO_URL
OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET
OAUTH_REDIRECT_URI
OAUTH_ALLOWED_EMAIL_DOMAIN
LOCKCOMPUTER_AUTH_SECRET
LOCKCOMPUTER_CLIENT_KEY
LOCKCOMPUTER_ADMIN_EMAILS
LOCKCOMPUTER_ADMIN_WEB_URL
LOCKCOMPUTER_SESSION_HOURS
LOCKCOMPUTER_MACHINE_PREFIX
LOCKCOMPUTER_MACHINE_COUNT
```

The current development values remain in an ignored local environment file for local testing only. Production uses a different `LOCKCOMPUTER_AUTH_SECRET` and `LOCKCOMPUTER_CLIENT_KEY` and sets the OAuth redirect URI to the public Next.js URL.

## Migration and cutover

The migration is implemented in these stages:

1. Add server-only TypeScript modules and in-memory test doubles.
2. Add Route Handlers with the contract-preserving responses.
3. Add Google Sheets authentication and session restore.
4. Point the Admin UI and local Client to Next.js in development.
5. Run route, Sheets, OAuth, session, presence, and shutdown contract tests.
6. Build the production Next.js application and run a safe health/poll smoke test.
7. Update Client `ServerBaseUrl` and OAuth redirect configuration for the Windows Server URL.
8. Keep the ASP.NET project as a rollback reference until one disposable Client completes the manual login, session, audit, and shutdown test.

## Testing strategy

- Unit tests for session management, monthly report calculation, presence expiry, command consumption, key comparison, and cookie signing.
- Route contract tests for every preserved endpoint, status code, headers, and response fields.
- Google Sheets tests with an in-memory adapter and no credentials in test output.
- Admin UI tests for relative API requests, Online/Offline labels, confirmation, and shutdown loading state.
- `npm test`, `npx tsc --noEmit`, and `npm run build` must pass.
- Smoke test `/api/health` and a valid Client poll without queuing a command.
- Manual shutdown verification is performed only on one disposable Client after deployment approval.

