import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');

test('zone dropdown uses Anuphan typography', () => {
  const styles = read('./app/globals.css');
  assert.match(styles, /\.zone-select select[^}]*font-family:\s*var\(--font-anuphan\)/s);
  assert.match(styles, /\.zone-select option[^}]*font-family:\s*var\(--font-anuphan\)/s);
});

test('monthly reports expose zone fields', () => {
  assert.match(read('./app/api/admin/reports/monthly/route.ts'), /MonthlyReportBuilder/);
  assert.match(read('./app/api/admin/export/monthly.csv/route.ts'), /zone/);
});

test('Admin dashboard exposes zone filtering and summaries', () => {
  const page = read('./app/page.tsx');
  const zones = read('./lib/server/zones.ts');
  assert.match(page, /MACHINE_ZONES/);
  assert.match(page, /zoneFilter/);
  assert.match(page, /zoneRows/);
  assert.match(page, /machine\.zone === zoneFilter/);
  for (const zone of ['A-407', 'A-412', 'A-410', 'ชั้น-3', 'DLP', 'ศูนย์อีสาน']) {
    assert.match(zones, new RegExp(zone));
  }
});

test('Next.js admin page exposes machine, report and force-logout flows', () => {
  const page = read('./app/page.tsx');
  for (const endpoint of ['/api/me', '/api/machines', '/api/admin/reports/monthly', '/api/admin/export/monthly.csv', '/api/admin/sessions/']) {
    assert.match(page, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  assert.match(page, /LockComputer Admin/);
});

test('Next.js owns the API and OAuth routes', () => {
  const config = read('./next.config.mjs');
  assert.doesNotMatch(config, /rewrites/);
  assert.match(read('./app/api/health/route.ts'), /getRuntime/);
  assert.match(read('./app/auth/login/route.ts'), /createAuthorizationUrl/);
});

test('Admin dashboard is available at the /admin route', () => {
  assert.match(read('./app/admin/page.tsx'), /\.\.\/page/);
});

test('Admin dashboard exposes remote shutdown controls for online machines', () => {
  const page = read('./app/page.tsx');
  const styles = read('./app/globals.css');
  assert.match(page, /online/);
  assert.match(page, /lastSeenAt/);
  assert.match(page, /\/api\/admin\/machines\/.*shutdown/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /Shutdown|ปิดเครื่อง/);
  assert.match(styles, /button-shutdown/);
});

test('Next.js server modules expose the shared configuration boundary', () => {
  const config = read('./lib/server/config.ts');
  assert.match(config, /getServerConfig/);
  assert.match(config, /isKnownMachine/);
});

test('Next.js server modules expose the Google Sheets store boundary', () => {
  const store = read('./lib/server/store.ts');
  const googleSheets = read('./lib/server/google-sheets.ts');
  const admins = read('./lib/server/admin-registry.ts');
  assert.match(store, /InMemorySheetStore/);
  assert.match(store, /GoogleSheetsStore/);
  assert.match(googleSheets, /sessionsRange/);
  assert.match(googleSheets, /eventsRange/);
  assert.match(googleSheets, /adminsRange/);
  assert.match(admins, /AdminRegistry/);
});

test('Next.js exposes the full LockComputer Route Handler surface', () => {
  const routes = [
    './app/auth/login/route.ts',
    './app/auth/callback/route.ts',
    './app/api/health/route.ts',
    './app/api/me/route.ts',
    './app/api/auth/client-exchange/route.ts',
    './app/api/client/poll/route.ts',
    './app/api/machines/route.ts',
    './app/api/sessions/check-in/route.ts',
    './app/api/sessions/[id]/heartbeat/route.ts',
    './app/api/sessions/[id]/logout/route.ts',
    './app/api/admin/sessions/[id]/force-logout/route.ts',
    './app/api/admin/machines/[machineId]/shutdown/route.ts',
    './app/api/admin/reports/monthly/route.ts',
    './app/api/admin/export/monthly.csv/route.ts',
    './app/api/admin/admins/route.ts',
  ];
  for (const route of routes) assert.doesNotThrow(() => read(route));
});

test('Admin dashboard exposes root-only Admin management', () => {
  const page = read('./app/page.tsx');
  assert.match(page, /\/api\/admin\/admins/);
  assert.match(page, /canManage/);
  assert.match(page, /เพิ่มผู้ดูแล|Add Admin/);
});
