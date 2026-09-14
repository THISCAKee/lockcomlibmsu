# Smartlib Subpath Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the complete LockComputer Admin, OAuth, and Client API at `https://smartlib.msu.ac.th/comlibmsu` without changing any other Smartlib application or the existing `etraining` process.

**Architecture:** Next.js owns a fixed `/comlibmsu` base path and browser code uses one `appPath()` boundary for raw URLs. IIS ARR proxies only the existing `Default Web Site > comlibmsu` application to a loopback-only PM2 process on port 3001; WPF Clients use the same public base URL through `ServerBaseUrl`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8, Node test runner/tsx, WPF .NET 10, IIS URL Rewrite + ARR, PM2, Google OAuth, Google Sheets.

**Spec:** `docs/superpowers/specs/2026-09-14-smartlib-subpath-deployment-design.md`

## Global Constraints

- Public base URL is exactly `https://smartlib.msu.ac.th/comlibmsu`.
- Next.js base path is exactly `/comlibmsu`.
- PM2 process name remains `lockcomputer`, binds only to `127.0.0.1`, and uses port `3001`.
- Existing PM2 process `etraining` and port `3000` must not be stopped, restarted, deleted, or reconfigured.
- IIS changes are scoped to `Default Web Site > comlibmsu`; no root-level `/_next`, `/api`, or `/auth` rewrite is allowed.
- OAuth accepts only `@msu.ac.th`; `/admin` and `/admin/usage` require Admin registry authorization.
- Never commit or print OAuth secrets, Client keys, auth secrets, or Google service-account content.
- Google Sheets data, machine inventory `PC-001` through `PC-203`, zone definitions, and reporting semantics remain unchanged.
- Preserve the existing unrelated working-tree changes in `ecosystem.config.cjs` and `tests/production-deployment.test.mjs`; Task 4 incorporates them deliberately.

## File map

- `next.config.mjs`: declares the framework base path.
- `lib/app-path.ts`: owns the browser-safe `APP_BASE_PATH` and `appPath()` API.
- `app/page.tsx`: prefixes Admin dashboard API calls and navigation.
- `app/admin/usage/page.tsx`: prefixes report API calls, OAuth navigation, Admin navigation, and CSV export.
- `lib/server/http.ts`: owns cookie path and trusted HTTPS detection.
- `lib/server/oauth-return.ts`: owns the allowlisted OAuth return targets.
- `app/auth/login/route.ts`: creates state cookies and preserves an allowlisted return target.
- `app/auth/callback/route.ts`: applies Admin authorization and redirects to the requested Admin page.
- `ecosystem.config.cjs`: starts Next.js directly on loopback port 3001.
- `web.config`: redirects this application path to HTTPS and scopes the IIS reverse proxy to `/comlibmsu`.
- `.env.example`: documents local URLs with the new base path.
- `deploy/production-env.example`: documents the final public URLs without containing secrets.
- `src/LockComputer.Client/clientsettings.json`: supplies the public base URL copied into new Client builds.
- `tests/app-path.test.ts`: verifies URL prefixing and idempotence.
- `tests/http.test.ts`: verifies cookie scope and proxy-aware HTTPS detection.
- `tests/oauth-return.test.ts`: verifies the return-target allowlist.
- `tests/admin-contract.test.mjs`: prevents raw root-relative browser URLs from returning.
- `tests/routes-contract.test.ts`: verifies Login and callback behavior through the route boundary.
- `tests/production-deployment.test.mjs`: verifies PM2 and IIS deployment declarations.
- `tests/LockComputer.Client.Tests/Program.cs`: verifies the WPF production base URL and composed endpoint shape.

---

### Task 1: Establish the `/comlibmsu` application-path boundary

**Files:**
- Create: `lib/app-path.ts`
- Create: `tests/app-path.test.ts`
- Modify: `next.config.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `APP_BASE_PATH: '/comlibmsu'`
- Produces: `appPath(path: string): string`, which prefixes an application-relative path once.
- Consumes: no earlier task.

- [ ] **Step 1: Write the failing path tests**

Create `tests/app-path.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_BASE_PATH, appPath } from '../lib/app-path';

test('application paths are rooted below the Smartlib subpath exactly once', () => {
  assert.equal(APP_BASE_PATH, '/comlibmsu');
  assert.equal(appPath('/admin'), '/comlibmsu/admin');
  assert.equal(appPath('/api/me'), '/comlibmsu/api/me');
  assert.equal(appPath('/api/me?refresh=1'), '/comlibmsu/api/me?refresh=1');
  assert.equal(appPath('/comlibmsu/admin'), '/comlibmsu/admin');
});

test('Next.js declares the same base path', () => {
  const config = fs.readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /basePath:\s*['"]\/comlibmsu['"]/);
});
```

Add `tests/app-path.test.ts` to the `test:server` command in `package.json`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx tsx --test tests/app-path.test.ts
```

Expected: FAIL because `lib/app-path.ts` does not exist and `next.config.mjs` has no base path.

- [ ] **Step 3: Implement the path boundary**

Create `lib/app-path.ts`:

```ts
export const APP_BASE_PATH = '/comlibmsu' as const;

export function appPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) return normalized;
  return `${APP_BASE_PATH}${normalized}`;
}
```

Change `next.config.mjs` to:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '/comlibmsu',
};

export default nextConfig;
```

- [ ] **Step 4: Run focused and existing contract tests**

Run:

```powershell
npx tsx --test tests/app-path.test.ts
node tests/admin-contract.test.mjs
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the foundation**

```powershell
git add next.config.mjs lib/app-path.ts tests/app-path.test.ts package.json
git commit -m "feat: add smartlib application base path"
```

---

### Task 2: Prefix every browser-side Admin URL

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/admin/usage/page.tsx`
- Modify: `tests/admin-contract.test.mjs`

**Interfaces:**
- Consumes: `appPath(path: string): string` from Task 1.
- Produces: Admin pages with no raw root-level `/api`, `/auth`, or `/admin` browser navigation.

- [ ] **Step 1: Add a failing browser URL contract**

Add to `tests/admin-contract.test.mjs`:

```js
test('Admin browser URLs stay inside the Smartlib application path', () => {
  for (const file of ['./app/page.tsx', './app/admin/usage/page.tsx']) {
    const source = read(file);
    assert.match(source, /appPath/);
    assert.doesNotMatch(source, /fetch\(\s*['"`]\/api\//);
    assert.doesNotMatch(source, /window\.location\.href\s*=\s*['"`]\/auth\//);
    assert.doesNotMatch(source, /href=\s*['"]\/admin/);
  }
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node tests/admin-contract.test.mjs
```

Expected: FAIL because both pages still contain root-relative browser URLs.

- [ ] **Step 3: Prefix dashboard URLs**

Import the helper in `app/page.tsx`:

```ts
import { appPath } from '../lib/app-path';
```

Apply it to every browser URL, including dynamic endpoints:

```ts
await fetch(appPath('/api/me'));
window.location.href = appPath('/auth/login?returnUrl=/admin');
fetch(appPath('/api/machines'));
fetch(appPath('/api/admin/admins'));
fetch(appPath(`/api/admin/sessions/${sessionId}/force-logout`), { method: 'POST' });
fetch(appPath(`/api/admin/machines/${machineId}/shutdown`), { method: 'POST' });
fetch(appPath(`/api/admin/machines/${machineId}/close`), { method: 'POST' });
```

Use `href={appPath('/admin/usage')}` for the usage-page link and wrap the Admin creation endpoint with `appPath()`.

- [ ] **Step 4: Prefix usage-page URLs**

Import the helper in `app/admin/usage/page.tsx`:

```ts
import { appPath } from '../../../lib/app-path';
```

Use these exact URL forms:

```ts
await fetch(appPath('/api/me'));
window.location.href = appPath('/auth/login?returnUrl=/admin/usage');
await fetch(appPath(`/api/admin/reports/monthly?year=${year}&month=${month}`));
```

Use `href={appPath('/admin')}` for dashboard navigation and:

```tsx
href={appPath(`/api/admin/export/monthly.csv?year=${monthParts(selectedMonth).year}&month=${monthParts(selectedMonth).month}`)}
```

for CSV export.

- [ ] **Step 5: Verify the focused tests and build-time type checking**

Run:

```powershell
node tests/admin-contract.test.mjs
npx tsx --test tests/app-path.test.ts
npm run build
```

Expected: all commands PASS; generated application routes are served below the configured base path.

- [ ] **Step 6: Commit browser migration**

```powershell
git add app/page.tsx app/admin/usage/page.tsx tests/admin-contract.test.mjs
git commit -m "fix: keep admin requests inside smartlib subpath"
```

---

### Task 3: Scope OAuth, Admin redirects, and cookies to `/comlibmsu`

**Files:**
- Create: `lib/server/oauth-return.ts`
- Create: `tests/oauth-return.test.ts`
- Create: `tests/http.test.ts`
- Modify: `lib/server/http.ts`
- Modify: `app/auth/login/route.ts`
- Modify: `app/auth/callback/route.ts`
- Modify: `tests/routes-contract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `APP_BASE_PATH` from Task 1.
- Produces: `normalizeOAuthReturn(value: string | null): '/admin' | '/admin/usage' | '/client'`.
- Produces: `isAdminOAuthReturn(value: OAuthReturn): boolean`.
- Produces: `isSecureRequest(request: Request): boolean`.

- [ ] **Step 1: Write failing return-target and HTTP tests**

Create `tests/oauth-return.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminOAuthReturn, normalizeOAuthReturn } from '../lib/server/oauth-return';

test('OAuth return targets preserve approved Admin pages and reject open redirects', () => {
  assert.equal(normalizeOAuthReturn('/admin'), '/admin');
  assert.equal(normalizeOAuthReturn('/admin/usage'), '/admin/usage');
  assert.equal(normalizeOAuthReturn('/client'), '/client');
  assert.equal(normalizeOAuthReturn('https://evil.example'), '/client');
  assert.equal(normalizeOAuthReturn('//evil.example'), '/client');
  assert.equal(isAdminOAuthReturn('/admin'), true);
  assert.equal(isAdminOAuthReturn('/admin/usage'), true);
  assert.equal(isAdminOAuthReturn('/client'), false);
});
```

Create `tests/http.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCookie, isSecureRequest, setCookie } from '../lib/server/http';

test('LockComputer cookies are scoped to the Smartlib application', () => {
  assert.match(setCookie('test', 'value', { maxAge: 60, secure: true }), /Path=\/comlibmsu/);
  assert.match(clearCookie('test', true), /Path=\/comlibmsu/);
});

test('HTTPS is recognized through the trusted IIS forwarding header', () => {
  assert.equal(isSecureRequest(new Request('http://127.0.0.1/test', { headers: { 'x-forwarded-proto': 'https' } })), true);
  assert.equal(isSecureRequest(new Request('https://smartlib.msu.ac.th/test')), true);
  assert.equal(isSecureRequest(new Request('http://127.0.0.1/test')), false);
});
```

Add both files to `test:server` in `package.json`.

- [ ] **Step 2: Extend the route contract before implementation**

In the existing OAuth login test in `tests/routes-contract.test.ts`, request:

```ts
const response = await GET(new Request('http://localhost:3000/comlibmsu/auth/login?returnUrl=/admin/usage', {
  headers: { 'x-forwarded-proto': 'https' },
}));
```

Then require:

```ts
assert.match(cookies, /lockcomputer_oauth_return=%2Fadmin%2Fusage/);
assert.match(cookies, /Path=\/comlibmsu/);
assert.match(cookies, /Secure/);
```

Add this callback test using the existing mocked provider boundary:

```ts
test('Admin OAuth preserves the usage-page return target', async () => {
  const { GET } = await import('../app/auth/callback/route');
  const { getServerConfig } = await import('../lib/server/config');
  const config = getServerConfig();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => String(input) === config.oauth.tokenUrl
    ? Response.json({ access_token: 'test-access-token' })
    : Response.json({ email: 'khunanon.m@msu.ac.th' });
  try {
    const response = await GET(new Request('http://localhost:3000/comlibmsu/auth/callback?state=test-state&code=test-code', {
      headers: {
        'x-forwarded-proto': 'https',
        cookie: 'lockcomputer_oauth_state=test-state; lockcomputer_oauth_return=%2Fadmin%2Fusage',
      },
    }));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `${config.adminWebUrl.replace(/\/$/, '')}/admin/usage`);
    const cookies = response.headers.getSetCookie?.().join('\n') ?? response.headers.get('set-cookie') ?? '';
    assert.match(cookies, /lockcomputer_admin=/);
    assert.match(cookies, /Path=\/comlibmsu/);
    assert.match(cookies, /Secure/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npx tsx --test tests/oauth-return.test.ts tests/http.test.ts tests/routes-contract.test.ts
```

Expected: FAIL because the new modules do not exist, cookies use `/`, proxy HTTPS is ignored, and `/admin/usage` is normalized to `/client`.

- [ ] **Step 4: Implement the return-target allowlist**

Create `lib/server/oauth-return.ts`:

```ts
export type OAuthReturn = '/admin' | '/admin/usage' | '/client';

const allowed = new Set<OAuthReturn>(['/admin', '/admin/usage', '/client']);

export function normalizeOAuthReturn(value: string | null): OAuthReturn {
  return value && allowed.has(value as OAuthReturn) ? value as OAuthReturn : '/client';
}

export function isAdminOAuthReturn(value: OAuthReturn) {
  return value === '/admin' || value === '/admin/usage';
}
```

- [ ] **Step 5: Implement cookie scope and HTTPS detection**

Update `lib/server/http.ts` to import `APP_BASE_PATH`, default every cookie to that path, clear with the same path, and expose:

```ts
export function isSecureRequest(request: Request) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')
    ?.split(',', 1)[0]
    .trim()
    .toLowerCase();
  return new URL(request.url).protocol === 'https:' || forwardedProtocol === 'https';
}
```

The cookie attribute list must contain:

```ts
`Path=${options.path ?? APP_BASE_PATH}`
```

- [ ] **Step 6: Apply the helpers to Login and callback routes**

In `app/auth/login/route.ts`, replace local return validation and direct protocol checking with:

```ts
const returnUrl = normalizeOAuthReturn(url.searchParams.get('returnUrl'));
const secure = isSecureRequest(request);
```

In `app/auth/callback/route.ts`, use:

```ts
const returnUrl = normalizeOAuthReturn(cookieValue(request, 'lockcomputer_oauth_return') ?? null);
const secure = isSecureRequest(request);

if (isAdminOAuthReturn(returnUrl)) {
  if (!state.admins.isAdmin(email)) return clearAuthCookies(jsonError('This account is not an Admin.', 403));
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const response = redirectResponse(`${state.config.adminWebUrl.replace(/\/$/, '')}${returnUrl}`);
  response.headers.append('set-cookie', setCookie('lockcomputer_admin', signAdminCookie(email, expiresAt, state.config.authSecret), { maxAge: 12 * 60 * 60, secure }));
  return clearAuthCookies(response);
}
```

Keep the existing Client one-time-code flow unchanged.

- [ ] **Step 7: Verify focused and full server tests**

Run:

```powershell
npx tsx --test tests/oauth-return.test.ts tests/http.test.ts tests/routes-contract.test.ts
npm test
```

Expected: all tests PASS, including the `/admin/usage` return path and unauthorized Admin rejection.

- [ ] **Step 8: Commit OAuth and cookie isolation**

```powershell
git add lib/server/oauth-return.ts lib/server/http.ts app/auth/login/route.ts app/auth/callback/route.ts tests/oauth-return.test.ts tests/http.test.ts tests/routes-contract.test.ts package.json
git commit -m "fix: scope OAuth flow to smartlib subpath"
```

---

### Task 4: Make PM2 and IIS declarations safe for a shared server

**Files:**
- Modify: `ecosystem.config.cjs`
- Create: `web.config`
- Modify: `tests/production-deployment.test.mjs`

**Interfaces:**
- Consumes: fixed `/comlibmsu` Next.js base path from Task 1.
- Produces: loopback Next.js command `next start -H 127.0.0.1 -p 3001`.
- Produces: an IIS application-level proxy target `http://127.0.0.1:3001/comlibmsu/{R:1}`.

- [ ] **Step 1: Tighten the failing production declaration test**

Update the PM2 assertion in `tests/production-deployment.test.mjs` and add an IIS assertion:

```js
test('PM2 exposes Next.js only through loopback port 3001', () => {
  const config = read('./ecosystem.config.cjs');
  assert.match(config, /name:\s*['"]lockcomputer['"]/);
  assert.match(config, /script:\s*['"]node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next['"]/);
  assert.match(config, /args:\s*['"]start -H 127\.0\.0\.1 -p 3001['"]/);
  assert.match(config, /exec_mode:\s*['"]fork['"]/);
});

test('IIS proxies only the comlibmsu application to the loopback Next.js path', () => {
  const config = read('./web.config');
  assert.match(config, /<match url="\(\.\*\)" \/>/);
  assert.match(config, /https:\/\/smartlib\.msu\.ac\.th\/comlibmsu\/{R:1}/);
  assert.match(config, /url="http:\/\/127\.0\.0\.1:3001\/comlibmsu\/{R:1}"/);
  assert.match(config, /HTTP_X_FORWARDED_PROTO/);
  assert.match(config, /appendQueryString="true"/);
  assert.match(config, /stopProcessing="true"/);
  assert.doesNotMatch(config, /etraining|localhost:3000/);
});
```

- [ ] **Step 2: Run the production contract and verify RED**

Run:

```powershell
node tests/production-deployment.test.mjs
```

Expected: FAIL because PM2 does not bind loopback and `web.config` does not exist.

- [ ] **Step 3: Bind PM2 to loopback**

Change the `ecosystem.config.cjs` application arguments to:

```js
args: 'start -H 127.0.0.1 -p 3001',
```

Keep the existing direct Next.js script, fork mode, one instance, production environment, and `lockcomputer` name.

- [ ] **Step 4: Add the IIS application-level rewrite file**

Create `web.config`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Require HTTPS for LockComputer" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^off$" />
          </conditions>
          <action type="Redirect"
                  url="https://smartlib.msu.ac.th/comlibmsu/{R:1}"
                  appendQueryString="true"
                  redirectType="Permanent" />
        </rule>
        <rule name="LockComputer Next.js reverse proxy" stopProcessing="true">
          <match url="(.*)" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
          <action type="Rewrite"
                  url="http://127.0.0.1:3001/comlibmsu/{R:1}"
                  appendQueryString="true" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

Do not add root-level Smartlib rules. IIS must allow the `HTTP_X_FORWARDED_PROTO` server variable at the server URL Rewrite boundary before this file is activated. Application security also depends on Task 3's proxy-aware Secure Cookie logic and PM2's loopback binding.

- [ ] **Step 5: Verify declarations and production build**

Run:

```powershell
node tests/production-deployment.test.mjs
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit deployment declarations**

```powershell
git add ecosystem.config.cjs web.config tests/production-deployment.test.mjs
git commit -m "deploy: proxy smartlib subpath to loopback next server"
```

---

### Task 5: Configure WPF Clients for the shared public base URL

**Files:**
- Modify: `D:\ComputerLIBMSU\tests\LockComputer.Client.Tests\Program.cs`
- Modify: `D:\ComputerLIBMSU\src\LockComputer.Client\clientsettings.json`

**Interfaces:**
- Consumes: `ServerBaseUrl` followed by existing `/auth/...` and `/api/...` suffixes.
- Produces: Client requests below `https://smartlib.msu.ac.th/comlibmsu` without changing Machine ID or Client key handling.

- [ ] **Step 1: Add a failing Client configuration contract**

After `clientSettingsJson` is loaded in `tests/LockComputer.Client.Tests/Program.cs`, add:

```csharp
const string publicServerBaseUrl = "https://smartlib.msu.ac.th/comlibmsu";
if (!clientSettingsJson.Contains($"\"ServerBaseUrl\": \"{publicServerBaseUrl}\"", StringComparison.Ordinal) ||
    !new Uri(new Uri(publicServerBaseUrl + "/"), "api/client/poll").AbsoluteUri.Equals(
        "https://smartlib.msu.ac.th/comlibmsu/api/client/poll",
        StringComparison.Ordinal))
{
    Console.WriteLine("FAIL ClientUsesSmartlibSubpathBaseUrl");
    return 1;
}

Console.WriteLine("PASS ClientUsesSmartlibSubpathBaseUrl");
```

- [ ] **Step 2: Run the Client contract and verify RED**

From `D:\ComputerLIBMSU`, run:

```powershell
dotnet run --project tests\LockComputer.Client.Tests\LockComputer.Client.Tests.csproj -c Release
```

Expected: `FAIL ClientUsesSmartlibSubpathBaseUrl` because the source configuration still points to localhost.

- [ ] **Step 3: Change only the Client base URL**

Update `src/LockComputer.Client/clientsettings.json` so it retains the existing per-machine `MachineId` and secret `ClientKey`, but its URL is:

```json
"ServerBaseUrl": "https://smartlib.msu.ac.th/comlibmsu"
```

Do not copy the real Client key into tests, documentation, terminal output, or Git.

- [ ] **Step 4: Run Client tests and build**

Run:

```powershell
dotnet run --project tests\LockComputer.Client.Tests\LockComputer.Client.Tests.csproj -c Release
dotnet build src\LockComputer.Client\LockComputer.Client.csproj -c Release
```

Expected: the contract prints `PASS ClientUsesSmartlibSubpathBaseUrl`; both commands exit 0.

- [ ] **Step 5: Record the non-Git Client change**

`D:\ComputerLIBMSU` is not a Git repository, so do not run a root-level commit. Record the two verified paths in the deployment handoff and preserve the per-machine `MachineId`/`ClientKey` when publishing each Client.

---

### Task 6: Document production values and execute staged deployment

**Files:**
- Modify: `.env.example`
- Create: `deploy/production-env.example`
- Modify: `docs/superpowers/plans/2026-09-11-windows-server-deploy.md`
- Verify on server: `C:\inetpub\wwwroot\comlibmsu\.env.production.local`
- Verify on server: `C:\inetpub\wwwroot\comlibmsu\web.config`

**Interfaces:**
- Consumes: all implementation artifacts from Tasks 1–5.
- Produces: a verified public deployment and a one-machine Client pilot before rollout to 203 machines.

- [ ] **Step 1: Add failing deployment documentation assertions**

Extend `tests/production-deployment.test.mjs`:

```js
test('deployment documentation uses the final Smartlib URLs', () => {
  const localEnv = read('./.env.example');
  const productionEnv = read('./deploy/production-env.example');
  const runbook = read('./docs/superpowers/plans/2026-09-11-windows-server-deploy.md');
  assert.match(localEnv, /http:\/\/localhost:3000\/comlibmsu\/auth\/callback/);
  assert.match(localEnv, /http:\/\/localhost:3000\/comlibmsu/);
  for (const source of [productionEnv, runbook]) {
    assert.match(source, /https:\/\/smartlib\.msu\.ac\.th\/comlibmsu/);
    assert.match(source, /comlibmsu\/auth\/callback/);
  }
  assert.match(runbook, /127\.0\.0\.1:3001\/comlibmsu\/api\/health/);
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node tests/production-deployment.test.mjs
```

Expected: FAIL because the existing examples still describe root URLs or localhost without `/comlibmsu`.

- [ ] **Step 3: Update safe configuration examples**

Set these local values in `.env.example`:

```text
OAUTH_REDIRECT_URI=http://localhost:3000/comlibmsu/auth/callback
LOCKCOMPUTER_ADMIN_WEB_URL=http://localhost:3000/comlibmsu
```

Create `deploy/production-env.example` with only non-secret production values and comments directing the operator to preserve the existing secret values:

```text
OAUTH_REDIRECT_URI=https://smartlib.msu.ac.th/comlibmsu/auth/callback
LOCKCOMPUTER_ADMIN_WEB_URL=https://smartlib.msu.ac.th/comlibmsu
```

Update the Windows deployment runbook so internal and external checks are exactly:

```powershell
Invoke-WebRequest http://127.0.0.1:3001/comlibmsu/api/health
Invoke-WebRequest https://smartlib.msu.ac.th/comlibmsu/api/health
```

Document that `web.config` belongs at `C:\inetpub\wwwroot\comlibmsu\web.config` and that the rewrite rule is scoped to the `comlibmsu` IIS application.

- [ ] **Step 4: Run complete local verification**

From `D:\ComputerLIBMSU\apps\admin-next`, run:

```powershell
node tests/production-deployment.test.mjs
npm test
npm run build
```

From `D:\ComputerLIBMSU`, run:

```powershell
dotnet run --project tests\LockComputer.Client.Tests\LockComputer.Client.Tests.csproj -c Release
dotnet build src\LockComputer.Client\LockComputer.Client.csproj -c Release
```

Expected: every command exits 0 with no failing tests or TypeScript/build errors.

- [ ] **Step 5: Commit code and runbook updates**

```powershell
git add .env.example deploy/production-env.example docs/superpowers/plans/2026-09-11-windows-server-deploy.md tests/production-deployment.test.mjs
git commit -m "docs: finalize smartlib subpath deployment"
```

- [ ] **Step 6: Register OAuth and back up shared-server configuration**

In the MSU/Google OAuth client, add this exact authorized redirect URI without removing the previous value yet:

```text
https://smartlib.msu.ac.th/comlibmsu/auth/callback
```

On the Windows Server, back up only the files that will be replaced:

```powershell
$backupRoot = 'C:\ProgramData\LockComputer\backup-20260914'
New-Item -ItemType Directory -Path $backupRoot -Force
Copy-Item -LiteralPath 'C:\inetpub\wwwroot\comlibmsu\.env.production.local' -Destination $backupRoot
if (Test-Path -LiteralPath 'C:\inetpub\wwwroot\comlibmsu\web.config') {
  Copy-Item -LiteralPath 'C:\inetpub\wwwroot\comlibmsu\web.config' -Destination $backupRoot
}
```

Do not copy or display the Google credentials file.

- [ ] **Step 7: Deploy, rebuild, and restart only LockComputer**

Upload the tested Admin Next files, including `ecosystem.config.cjs` and `web.config`, to `C:\inetpub\wwwroot\comlibmsu`. Update only these two values in `.env.production.local`:

```text
OAUTH_REDIRECT_URI=https://smartlib.msu.ac.th/comlibmsu/auth/callback
LOCKCOMPUTER_ADMIN_WEB_URL=https://smartlib.msu.ac.th/comlibmsu
```

Then run:

```powershell
Set-Location 'C:\inetpub\wwwroot\comlibmsu'
npm ci
npm run build
pm2 startOrRestart '.\ecosystem.config.cjs' --only lockcomputer --update-env
```

Do not use `pm2 restart all`.

- [ ] **Step 8: Verify ARR and the application boundary**

In IIS Manager, select the server node, open **Application Request Routing Cache > Server Proxy Settings**, confirm **Enable proxy**, and apply only if currently disabled. At the server-level **URL Rewrite > View Server Variables**, add `HTTP_X_FORWARDED_PROTO` to the allowed list if it is absent. Confirm `Default Web Site > comlibmsu` is an IIS application and that its physical path is `C:\inetpub\wwwroot\comlibmsu`.

Verify the process and both Health boundaries:

```powershell
pm2 list
Invoke-WebRequest http://127.0.0.1:3001/comlibmsu/api/health
Invoke-WebRequest https://smartlib.msu.ac.th/comlibmsu/api/health
```

Expected: `etraining` and `lockcomputer` are both `online`; both Health requests return HTTP 200 with `store: google-sheets`.

- [ ] **Step 9: Verify OAuth and one Client pilot**

Open:

```text
https://smartlib.msu.ac.th/comlibmsu/admin
```

Sign in with the approved Admin account, verify `/admin/usage`, refresh machine status, and download one monthly CSV. Publish the WPF Client to one disposable test machine while preserving that machine's ID and the real Client key. Verify Login, check-in, heartbeat, logout, Google Sheets insertion, Admin status, and one non-destructive `close` command.

- [ ] **Step 10: Save and roll out only after the pilot passes**

On the server:

```powershell
pm2 save
pm2 list
```

Then distribute the verified `ServerBaseUrl` change to the remaining Clients while preserving each machine's unique `MachineId`. Retain the backup and old OAuth callback through the observation period; remove them only after rollback is no longer required.

## Rollback checkpoint

If internal Health fails, restore the previous Admin build/environment and restart only `lockcomputer`. If internal Health passes but external Health fails, restore only the previous `web.config` and inspect IIS logs; do not change PM2 or `etraining`. If OAuth alone fails, compare the exact callback URI and restore the previous two public URL environment values while keeping Google Sheets and Client secrets unchanged.
