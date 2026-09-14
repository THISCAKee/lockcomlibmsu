# LockComputer Smartlib Subpath Deployment Runbook

This runbook publishes LockComputer at `https://smartlib.msu.ac.th/comlibmsu` on the existing Windows Server. The Next.js process remains under PM2 as `lockcomputer` on loopback port `3001`. The existing `etraining` process and port `3000` are never restarted.

## Files and URLs

Upload the tested application to:

```text
C:\inetpub\wwwroot\comlibmsu
```

The IIS rewrite file must be:

```text
C:\inetpub\wwwroot\comlibmsu\web.config
```

Public URLs:

```text
https://smartlib.msu.ac.th/comlibmsu/admin
https://smartlib.msu.ac.th/comlibmsu/admin/usage
https://smartlib.msu.ac.th/comlibmsu/auth/callback
https://smartlib.msu.ac.th/comlibmsu/api/health
```

The internal backend URL is:

```text
http://127.0.0.1:3001/comlibmsu/api/health
```

Port `3001` must not be opened to the network. IIS is the public TLS endpoint.

## OAuth values

Register this exact callback URI in the MSU/Google OAuth client before testing Login:

```text
https://smartlib.msu.ac.th/comlibmsu/auth/callback
```

In `C:\inetpub\wwwroot\comlibmsu\.env.production.local`, set only:

```text
OAUTH_REDIRECT_URI=https://smartlib.msu.ac.th/comlibmsu/auth/callback
LOCKCOMPUTER_ADMIN_WEB_URL=https://smartlib.msu.ac.th/comlibmsu
```

Do not put `.env.production.local` or the Google service-account JSON in `public_html`, Git, or the IIS public directory outside the application configuration.

## Backup

Run PowerShell as Administrator and back up only the files being replaced:

```powershell
$backupRoot = 'C:\ProgramData\LockComputer\backup-20260914'
New-Item -ItemType Directory -Path $backupRoot -Force
Copy-Item -LiteralPath 'C:\inetpub\wwwroot\comlibmsu\.env.production.local' -Destination $backupRoot
if (Test-Path -LiteralPath 'C:\inetpub\wwwroot\comlibmsu\web.config') {
  Copy-Item -LiteralPath 'C:\inetpub\wwwroot\comlibmsu\web.config' -Destination $backupRoot
}
```

Do not print the environment file or credentials file.

## Upload and build

Upload the tested repository files with FileZilla, including `ecosystem.config.cjs`, `web.config`, `next.config.mjs`, `lib`, `app`, `public`, `package.json`, and `package-lock.json`. Do not upload `.env.local`, `.env.production.local`, `node_modules`, or any service-account credential file through a public web directory.

On the Windows Server:

```powershell
Set-Location 'C:\inetpub\wwwroot\comlibmsu'
npm ci
npm run build
```

The build must complete before PM2 is restarted because the `/comlibmsu` base path is included in generated browser assets.

## PM2

Confirm the config file exists, then restart only LockComputer:

```powershell
Test-Path '.\ecosystem.config.cjs'
pm2 startOrRestart '.\ecosystem.config.cjs' --only lockcomputer --update-env
pm2 list
```

Expected:

```text
etraining       online
lockcomputer    online
```

Do not use `pm2 restart all`, `pm2 delete all`, or any command that targets `etraining`.

## IIS ARR and URL Rewrite

1. Open IIS Manager.
2. Select the server node and open **Application Request Routing Cache > Server Proxy Settings**.
3. Confirm **Enable proxy** is checked and apply if it was disabled.
4. Select the server node, open **URL Rewrite > View Server Variables**, and add `HTTP_X_FORWARDED_PROTO` to the allowed server variables if it is absent.
5. Confirm `Default Web Site > comlibmsu` is an IIS application with physical path `C:\inetpub\wwwroot\comlibmsu`.
6. Confirm `web.config` is inside that application, not at the shared Smartlib site root.

The same server-variable change can be applied from an elevated PowerShell window. Run it only if the variable is not already listed; this avoids a duplicate-entry error:

```powershell
$appCmd = "$env:windir\System32\inetsrv\appcmd.exe"
$allowed = & $appCmd list config -section:system.webServer/rewrite/allowedServerVariables
if ($allowed -notmatch 'HTTP_X_FORWARDED_PROTO') {
  & $appCmd set config -section:system.webServer/rewrite/allowedServerVariables `
    /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
}
& $appCmd list config -section:system.webServer/rewrite/allowedServerVariables
```

The final output must contain `HTTP_X_FORWARDED_PROTO`. No `iisreset` is required; retry the health check after the command returns.

The application rule redirects HTTP to HTTPS and proxies HTTPS requests to:

```text
http://127.0.0.1:3001/comlibmsu/{path}
```

This rule must not be copied to the root `Default Web Site` configuration.

## Verification

Run the internal check first:

```powershell
Invoke-WebRequest http://127.0.0.1:3001/comlibmsu/api/health
```

Then run the public check:

```powershell
Invoke-WebRequest https://smartlib.msu.ac.th/comlibmsu/api/health
```

Both must return HTTP 200 and a response containing `"store":"google-sheets"`.

Open the Admin page and verify:

```text
https://smartlib.msu.ac.th/comlibmsu/admin
```

Sign in with `khunanon.m@msu.ac.th`. Verify the Admin dashboard, `/admin/usage`, CSV download, and machine refresh. Check browser developer tools for the absence of 404s under `/_next`, `/api`, and `/auth`.

Pilot one WPF Client by setting its `ServerBaseUrl` to:

```json
"https://smartlib.msu.ac.th/comlibmsu"
```

Verify Login, check-in, heartbeat, logout, Google Sheets insertion, and one non-destructive Admin close command before updating the remaining Clients.

## Rollback

If the internal Health check fails, restore the previous application build and `.env.production.local`, then restart only `lockcomputer` using the previous PM2 declaration.

If internal Health passes but the public check fails, restore the previous `web.config` and inspect IIS/ARR logs without changing PM2 or `etraining`.

If only OAuth fails, compare `OAUTH_REDIRECT_URI` with the registered callback URI character-for-character, including `/comlibmsu/auth/callback`. Keep Google Sheets credentials and Client keys unchanged.
