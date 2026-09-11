# Zone Inventory and Usage Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the six approved zones to the 203-machine inventory and expose zone-aware dashboard and monthly usage reporting without changing existing Google Sheets row schemas.

**Architecture:** Keep one fixed, tested machine-ID range registry in `lib/server/zones.ts`. Derive each machine's zone from its ID for the machines API and monthly report; keep `Sessions`, `Events`, and `Admins` persistence unchanged. Additive zone fields in JSON/CSV preserve existing report data while allowing the Admin UI to filter and summarize by zone.

**Tech Stack:** Next.js 16.3.4 App Router, TypeScript, React 19, Node test runner through `tsx`, Google Sheets REST store.

**Spec:** `docs/superpowers/specs/2026-09-11-zone-inventory-report-design.md`

## Global Constraints

- The inventory is exactly 203 machines: `PC-001` through `PC-203`.
- The fixed mapping is A-407 `PC-001`–`PC-050`, A-412 `PC-051`–`PC-100`, A-410 `PC-101`–`PC-150`, ชั้น-3 `PC-151`–`PC-171`, DLP `PC-172`–`PC-201`, and ศูนย์อีสาน `PC-202`–`PC-203`.
- Existing `Sessions`, `Events`, and `Admins` Google Sheets schemas remain unchanged.
- Unknown machine IDs remain rejected by the existing machine validation and must not resolve to a valid zone.
- Existing monthly overlap calculation, rounding, authentication, session, shutdown, and Google Sheets behavior must remain passing.

### Task 1: Add the tested zone registry and machine API field

**Files:**
- Create: `lib/server/zones.ts`
- Modify: `lib/server/types.ts` (`MachineView`)
- Modify: `app/api/machines/route.ts`
- Modify: `tests/server-config.test.ts`
- Create: `tests/zones.test.ts`
- Modify: `tests/routes-contract.test.ts`
- Modify: `package.json` (`test:server` list)

**Interfaces:**
- Produces `MACHINE_ZONES: readonly ZoneDefinition[]`, `zoneForMachine(machineId: string): string | null`, and `machineCountForZone(zone: string): number` from `lib/server/zones.ts`.
- `MachineView` gains `zone: string`.
- `/api/machines` returns `zone` for every machine while retaining all existing fields.

- [ ] **Step 1: Write the failing registry and API tests**

Add tests that assert the six inclusive boundaries and the invalid boundary:

```ts
test('maps every machine boundary to the approved zone', () => {
  assert.equal(zoneForMachine('PC-001'), 'A-407');
  assert.equal(zoneForMachine('PC-050'), 'A-407');
  assert.equal(zoneForMachine('PC-051'), 'A-412');
  assert.equal(zoneForMachine('PC-100'), 'A-412');
  assert.equal(zoneForMachine('PC-101'), 'A-410');
  assert.equal(zoneForMachine('PC-150'), 'A-410');
  assert.equal(zoneForMachine('PC-151'), 'ชั้น-3');
  assert.equal(zoneForMachine('PC-171'), 'ชั้น-3');
  assert.equal(zoneForMachine('PC-172'), 'DLP');
  assert.equal(zoneForMachine('PC-201'), 'DLP');
  assert.equal(zoneForMachine('PC-202'), 'ศูนย์อีสาน');
  assert.equal(zoneForMachine('PC-203'), 'ศูนย์อีสาน');
  assert.equal(zoneForMachine('PC-204'), null);
});

test('zone counts sum to the 203-machine inventory', () => {
  assert.deepEqual(MACHINE_ZONES.map(zone => machineCountForZone(zone.name)), [50, 50, 50, 21, 30, 2]);
  assert.equal(MACHINE_ZONES.reduce((total, zone) => total + machineCountForZone(zone.name), 0), 203);
});
```

Update the existing machine API contract to assert `machines.length === 203`, `machines[0].zone === 'A-407'`, `machines[50].zone === 'A-412'`, and `machines[202].zone === 'ศูนย์อีสาน'`.

- [ ] **Step 2: Run the focused tests and verify the expected RED failure**

Run from `apps/admin-next`:

```powershell
npx tsx --test tests/zones.test.ts tests/server-config.test.ts tests/routes-contract.test.ts
```

Expected result: the new zone import is missing and the machine API contract fails because `MachineView` does not yet include zone data.

- [ ] **Step 3: Implement the minimal registry and API field**

Define the ordered registry exactly once:

```ts
export type ZoneDefinition = { name: string; start: number; end: number };

export const MACHINE_ZONES: readonly ZoneDefinition[] = [
  { name: 'A-407', start: 1, end: 50 },
  { name: 'A-412', start: 51, end: 100 },
  { name: 'A-410', start: 101, end: 150 },
  { name: 'ชั้น-3', start: 151, end: 171 },
  { name: 'DLP', start: 172, end: 201 },
  { name: 'ศูนย์อีสาน', start: 202, end: 203 },
];
```

Make `zoneForMachine` accept only the exact `PC-###` format, parse the number, and return the matching zone name or `null`. Make `machineCountForZone` return `end - start + 1`. In `/api/machines`, resolve the generated machine ID and include the resulting zone; known IDs must never produce `null`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

```powershell
npx tsx --test tests/zones.test.ts tests/server-config.test.ts tests/routes-contract.test.ts
```

Expected result: all focused tests pass, including the 203-machine endpoint checks.

- [ ] **Step 5: Commit the registry/API unit**

```powershell
git add lib/server/zones.ts lib/server/types.ts app/api/machines/route.ts tests/zones.test.ts tests/server-config.test.ts tests/routes-contract.test.ts package.json
git commit -m "feat: map machines to library zones"
```

### Task 2: Add zone fields and aggregates to monthly reporting

**Files:**
- Modify: `lib/server/types.ts` (`MonthlyReportRow`, `MonthlyReportView`)
- Modify: `lib/server/monthly-report.ts`
- Modify: `tests/monthly-report.test.ts`

**Interfaces:**
- `MonthlyReportRow` gains `zone: string`.
- `MonthlyReportView` gains `zoneRows: MonthlyZoneReportRow[]`.
- `MonthlyZoneReportRow` is `{ zone: string; machineCount: number; sessionCount: number; hours: number }`.
- `MonthlyReportBuilder.build(sessions, month)` keeps its existing signature and returns existing `rows` plus `zoneRows`.

- [ ] **Step 1: Write the failing report aggregation tests**

Extend the report fixture with sessions from `PC-001`, `PC-051`, and `PC-202`. Add this exact helper beside the fixture, then assert the machine rows carry the expected zones and the summaries aggregate by zone:

```ts
const session = (id: string, machineId: string, userEmail: string, startedAt: string, endedAt: string): Session => ({
  id, machineId, userEmail, startedAt, endedAt,
  expiresAt: endedAt,
  status: 'LoggedOut',
});

test('assigns sessions to zones and aggregates monthly usage by zone', () => {
  const report = MonthlyReportBuilder.build([
    session('one', 'PC-001', 'a@msu.ac.th', '2026-09-01T08:00:00.000Z', '2026-09-01T10:00:00.000Z'),
    session('two', 'PC-051', 'b@msu.ac.th', '2026-09-02T08:00:00.000Z', '2026-09-02T11:00:00.000Z'),
    session('three', 'PC-202', 'c@msu.ac.th', '2026-09-03T08:00:00.000Z', '2026-09-03T09:00:00.000Z'),
  ], '2026-09');

  assert.equal(report.rows.find(row => row.machineId === 'PC-001')?.zone, 'A-407');
  assert.deepEqual(report.zoneRows, [
    { zone: 'A-407', machineCount: 50, sessionCount: 1, hours: 2 },
    { zone: 'A-412', machineCount: 50, sessionCount: 1, hours: 3 },
    { zone: 'A-410', machineCount: 50, sessionCount: 0, hours: 0 },
    { zone: 'ชั้น-3', machineCount: 21, sessionCount: 0, hours: 0 },
    { zone: 'DLP', machineCount: 30, sessionCount: 0, hours: 0 },
    { zone: 'ศูนย์อีสาน', machineCount: 2, sessionCount: 1, hours: 1 },
  ]);
});
```

Use the repository's existing session fixture/helper shape; the important assertions are zone assignment, fixed inventory counts, session counts, and rounded hours.

- [ ] **Step 2: Run the report test and verify the expected RED failure**

```powershell
npx tsx --test tests/monthly-report.test.ts
```

Expected result: TypeScript or assertion failures because report rows and the report view do not yet expose zone fields.

- [ ] **Step 3: Implement the minimal zone-aware report builder**

Import `MACHINE_ZONES`, `machineCountForZone`, and `zoneForMachine`. Preserve the current month-overlap loop and user/machine grouping. Add `zone` to each machine row using `zoneForMachine(session.machineId) ?? 'ไม่ระบุ'`. Initialize one summary per approved zone with zero counts, increment the matching summary for each included session, and sort summaries in `MACHINE_ZONES` order. Keep `totalHours` calculated from the report rows exactly as before.

- [ ] **Step 4: Run all report and session tests and verify GREEN**

```powershell
npx tsx --test tests/monthly-report.test.ts tests/session-manager.test.ts tests/server-config.test.ts
```

Expected result: all tests pass and existing monthly rounding/overlap behavior is unchanged.

- [ ] **Step 5: Commit the reporting unit**

```powershell
git add lib/server/types.ts lib/server/monthly-report.ts tests/monthly-report.test.ts
git commit -m "feat: aggregate monthly usage by zone"
```

### Task 3: Expose zone-aware report JSON and CSV

**Files:**
- Modify: `app/api/admin/reports/monthly/route.ts` (uses the additive builder output)
- Modify: `app/api/admin/export/monthly.csv/route.ts`
- Modify: `tests/routes-contract.test.ts`
- Modify: `tests/admin-contract.test.mjs`

**Interfaces:**
- `/api/admin/reports/monthly` returns existing `month`, `rows`, and `totalHours`, plus `zoneRows`.
- Each report row includes `zone`.
- CSV header becomes `month,zone,user_email,machine_id,session_count,hours`.

- [ ] **Step 1: Write failing route/export assertions**

In the existing authorized monthly report test, assert `zoneRows` exists and contains the six zones. Assert the CSV text contains:

```text
month,zone,user_email,machine_id,session_count,hours
```

and a zone value such as `A-407` when the in-memory session fixture contains an A-407 session.

- [ ] **Step 2: Run the focused route tests and verify the expected RED failure**

```powershell
npx tsx --test tests/routes-contract.test.ts
```

Expected result: the existing report response has no `zoneRows`, and the CSV header has no `zone` column.

- [ ] **Step 3: Implement the additive API/CSV output**

Return the builder result unchanged from the JSON route so its new fields are serialized. In the CSV route, keep the existing authorization and month validation, change only the header and row order to `[selected, row.zone, row.userEmail, row.machineId, row.sessionCount, row.hours]`, and continue using `csvValue` for text fields.

- [ ] **Step 4: Run route, auth, and export tests and verify GREEN**

```powershell
npx tsx --test tests/routes-contract.test.ts tests/auth-session.test.ts tests/monthly-report.test.ts
```

Expected result: all route status/auth checks pass and JSON/CSV include zone information.

- [ ] **Step 5: Commit the API/export unit**

```powershell
git add app/api/admin/reports/monthly/route.ts app/api/admin/export/monthly.csv/route.ts tests/routes-contract.test.ts tests/admin-contract.test.mjs
git commit -m "feat: expose zones in reports and csv export"
```

### Task 4: Add zone filter and summaries to the Admin dashboard

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/admin-contract.test.mjs`

**Interfaces:**
- Client-side dashboard machine objects include `zone: string`.
- Client-side report objects include `zoneRows` with zone, machine count, session count, and hours.
- The dashboard maintains a `zoneFilter` state with `all` plus the six approved zone names.

- [ ] **Step 1: Write failing UI contract assertions**

Extend the Admin page contract test to require source strings for `zoneFilter`, `/api/admin/reports/monthly`, `zoneRows`, and the six zone labels. The contract must also require that the machine list is filtered using the selected zone.

- [ ] **Step 2: Run the UI contract test and verify the expected RED failure**

```powershell
node tests/admin-contract.test.mjs
```

Expected result: the new zone-related source assertions fail because the page does not yet define a zone filter or zone summary section.

- [ ] **Step 3: Implement the minimal dashboard UI**

Add the zone field to the `Machine` and `Report` TypeScript types. Import `{ MACHINE_ZONES }` from `../lib/server/zones`; keep that module limited to constants and pure functions so it is safe for the Client Component. Add a select control beside the existing search/status controls, derive `visibleMachines` by applying the zone filter after search/status filtering, and show the selected zone on each machine card/table row.

Add a report summary panel that maps `report.zoneRows` in registry order and displays each zone's inventory count, monthly session count, and hours. Keep the existing total-hours card, CSV link, force-logout, shutdown, and Admin management flows unchanged. Add responsive CSS using the existing white/gray/black/gold visual language, with no hover scale that changes layout dimensions.

- [ ] **Step 4: Run UI contracts and full TypeScript validation**

```powershell
node tests/admin-contract.test.mjs
npx tsc --noEmit
```

Expected result: all Admin page contracts pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the dashboard unit**

```powershell
git add app/page.tsx app/globals.css tests/admin-contract.test.mjs
git commit -m "feat: add zone filtering to admin dashboard"
```

### Task 5: Update documentation and complete verification

**Files:**
- Create: `docs/zone-rollout.md`

- [ ] **Step 1: Update rollout documentation**

Create `docs/zone-rollout.md` with the six machine ranges, explain that the existing Sheets tabs do not need new columns, note that new WPF clients use `PC-202` and `PC-203`, and document the CSV column order `month,zone,user_email,machine_id,session_count,hours`.

- [ ] **Step 2: Run the complete verification suite**

From `apps/admin-next`:

```powershell
npm test
npx tsc --noEmit
npm run build
node tests/production-deployment.test.mjs
```

Expected result: all tests pass, TypeScript completes with exit code 0, the Next.js production build completes successfully, and deployment checks pass.

- [ ] **Step 3: Inspect the final diff and status**

```powershell
git diff --check
git status --short
git log --oneline -6
```

Confirm that only zone feature files and documentation are present, no `.env.local` or credential file is staged, and the active app repository has a clean working tree after the final commit.

- [ ] **Step 4: Commit the rollout documentation**

```powershell
git add docs/zone-rollout.md
git commit -m "docs: document machine zones and usage reports"
```
