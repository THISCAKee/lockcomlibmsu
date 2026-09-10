import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');

test('Next.js admin page exposes machine, report and force-logout flows', () => {
  const page = read('./app/page.tsx');
  for (const endpoint of ['/api/me', '/api/machines', '/api/admin/reports/monthly', '/api/admin/export/monthly.csv', '/api/admin/sessions/']) {
    assert.match(page, new RegExp(endpoint.replaceAll('/', '\\/')));
  }
  assert.match(page, /LockComputer Admin/);
});

test('Next.js proxies API and OAuth routes to the ASP.NET server', () => {
  const config = read('./next.config.mjs');
  assert.match(config, /destination.*\/api\/:path/);
  assert.match(config, /destination.*\/auth\/:path/);
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
