# Smartlib Subpath Deployment Design

**Date:** 2026-09-14

## Objective

Expose the LockComputer Admin UI, OAuth flow, and Client API at the shared HTTPS origin `https://smartlib.msu.ac.th/comlibmsu` while leaving every other application under `smartlib.msu.ac.th` unchanged. The Next.js process remains on the Windows Server under PM2 and listens on port 3001.

## Confirmed constraints

- `smartlib.msu.ac.th` already serves other IIS applications.
- The IIS child path `Default Web Site > comlibmsu` is not currently serving a working application and is reserved for LockComputer.
- IIS URL Rewrite and Application Request Routing are installed. ARR proxy enablement will be verified before the rewrite rule is applied.
- The Next.js production process is already managed by PM2 as `lockcomputer` on port 3001.
- The existing `etraining` PM2 process and port 3000 must not be changed.
- Google OAuth must continue to allow only `@msu.ac.th` accounts, with Admin authorization enforced separately.
- The WPF LockComputer clients and Admin browser must use the same public base URL.

## Chosen architecture

The application will use a fixed Next.js base path of `/comlibmsu`. IIS terminates HTTPS for `smartlib.msu.ac.th` and proxies only requests inside the `comlibmsu` IIS application to the loopback Next.js listener.

```text
Admin browser / WPF Client
        |
        | HTTPS
        v
https://smartlib.msu.ac.th/comlibmsu/...
        |
        | IIS ARR + URL Rewrite (only the comlibmsu application)
        v
http://127.0.0.1:3001/comlibmsu/...
        |
        v
Next.js UI + OAuth + API + Google Sheets store
```

No root-level rules for `/_next`, `/api`, or `/auth` will be added to the shared site. This prevents LockComputer routes from colliding with existing Smartlib applications.

## Next.js routing

`next.config.mjs` will declare `basePath: '/comlibmsu'`. Next.js will therefore serve pages, Route Handlers, and framework assets only below that prefix.

Raw browser URLs are not automatically prefixed by Next.js. A small client-safe helper will be the single boundary for browser navigation, `fetch` calls, and download links. It will accept application-relative paths such as `/api/me` and return `/comlibmsu/api/me`.

The following public routes must work:

| Purpose | Public path |
| --- | --- |
| Admin dashboard | `/comlibmsu/admin` |
| Usage report | `/comlibmsu/admin/usage` |
| OAuth login | `/comlibmsu/auth/login` |
| OAuth callback | `/comlibmsu/auth/callback` |
| Health check | `/comlibmsu/api/health` |
| Client polling | `/comlibmsu/api/client/poll` |
| Session APIs | `/comlibmsu/api/sessions/...` |
| Admin APIs | `/comlibmsu/api/admin/...` |

Logical OAuth return values remain `/admin` and `/client`; they are internal flow identifiers rather than public URLs. Admin redirects continue to use the configured public Admin URL.

## OAuth and cookies

Production environment values will be:

```text
LOCKCOMPUTER_ADMIN_WEB_URL=https://smartlib.msu.ac.th/comlibmsu
OAUTH_REDIRECT_URI=https://smartlib.msu.ac.th/comlibmsu/auth/callback
```

The exact callback URI must be registered with the MSU/Google OAuth client before the new build is exposed. During deployment, the old callback may remain registered temporarily for rollback.

Admin and OAuth cookies will use `Path=/comlibmsu`, `HttpOnly`, and `SameSite=Lax`. HTTPS requests will use the `Secure` attribute. Cookie clearing must use the same path as cookie creation.

IIS will pass the original host and HTTPS scheme through trusted forwarded headers. The application will treat a request as secure when the direct request URL or the trusted forwarded protocol is HTTPS. Port 3001 will be bound to `127.0.0.1`, so external clients cannot forge proxy headers by connecting directly.

## WPF Client

The WPF client already appends `/auth/...` and `/api/...` to `ServerBaseUrl`. Deployment configuration will therefore set:

```json
{
  "ServerBaseUrl": "https://smartlib.msu.ac.th/comlibmsu"
}
```

No endpoint-specific branching will be added to the Client. Existing login, code exchange, check-in, heartbeat, logout, and command polling flows will all inherit the prefix from `ServerBaseUrl`.

The updated Client configuration must be distributed to all 203 machines only after the public Health and OAuth checks pass.

## IIS configuration

The rewrite rule will be scoped to `Default Web Site > comlibmsu`, not to the server or shared site root. At that application level IIS matches the path after `/comlibmsu`, so the upstream action restores the Next.js base path:

```text
match:  (.*)
target: http://127.0.0.1:3001/comlibmsu/{R:1}
```

The rule will preserve the query string, stop further rule processing, and pass the original host and HTTPS scheme. ARR proxying remains enabled globally, but no routing rule will be changed for `etraining` or any other IIS application.

The existing Smartlib HTTPS binding and certificate remain responsible for TLS. No additional hostname binding is required because this design reuses the existing host and isolates LockComputer by path.

## PM2 and network boundary

The PM2 ecosystem declaration will start the Next.js binary directly with these effective arguments:

```text
next start -H 127.0.0.1 -p 3001
```

PM2 remains in single-process fork mode. `pm2 save` will be run after the replacement process remains online and the internal Health endpoint succeeds. The existing `etraining` process is out of scope and must remain online.

## Error handling and diagnostics

- A missing `/comlibmsu` prefix should return 404 from Next.js instead of reaching a different application.
- OAuth redirect mismatch is diagnosed by comparing the provider registration with `OAUTH_REDIRECT_URI` exactly, including `/comlibmsu`.
- A 502 from IIS is diagnosed by checking PM2 status, PM2 logs, and the loopback Health endpoint before changing IIS.
- Browser 404s for assets or APIs are treated as a missing base-path prefix and covered by contract tests.
- Client failures are diagnosed using the configured `ServerBaseUrl`; secrets and bearer tokens must not be logged.

## Verification

Automated verification will cover:

- Next.js declares `/comlibmsu` as its base path.
- Every browser-side API call, login redirect, navigation link, and CSV download uses the shared path helper.
- OAuth and Admin cookies are created and cleared with `Path=/comlibmsu`.
- Secure-cookie detection accepts the trusted IIS HTTPS forwarding signal.
- WPF Client URL composition works when `ServerBaseUrl` contains `/comlibmsu`.
- PM2 binds Next.js to loopback port 3001.
- Existing server, Admin, reporting, Google Sheets, OAuth, and Client tests remain green.
- `npm run build` and the WPF build succeed.

Deployment verification will check, in order:

1. `http://127.0.0.1:3001/comlibmsu/api/health` returns HTTP 200 and `store: google-sheets`.
2. `https://smartlib.msu.ac.th/comlibmsu/api/health` returns HTTP 200.
3. Admin OAuth returns to the exact callback path and authorizes the approved Admin account.
4. Admin machine status and monthly usage pages load without asset or API 404s.
5. One test Client signs in, creates a session, heartbeats, logs out, and appears in Google Sheets.
6. The remaining Client configurations are deployed only after the test machine succeeds.

## Deployment and rollback

Deployment order minimizes interruption:

1. Register the new OAuth callback while retaining the old callback temporarily.
2. Back up the existing `comlibmsu` IIS configuration and production environment file.
3. Upload the tested build and PM2 declaration, then update the two public URL environment values.
4. Rebuild because the Next.js base path affects generated browser assets.
5. Restart only the `lockcomputer` PM2 process.
6. Add the IIS application-level rewrite rule and perform internal/external Health checks.
7. Test Admin OAuth and one WPF Client.
8. Update the remaining Client configurations and save the PM2 process list.

Rollback restores the previous build, environment values, and `comlibmsu` IIS configuration, then restarts only `lockcomputer`. No rollback step changes `etraining`, shared Smartlib content, Google Sheets data, or the service-account credential.

## Out of scope

- Creating a new DNS hostname.
- Moving the application to the Linux `library.msu.ac.th` server.
- Modifying existing Smartlib applications outside `/comlibmsu`.
- Changing machine inventory, zones, reporting semantics, or Admin authorization policy.
