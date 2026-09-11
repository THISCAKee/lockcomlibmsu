# Zone Inventory and Usage Reporting Design

## Goal

Expand the 203-machine inventory with six fixed zones and make the Admin dashboard and monthly reports show usage by zone.

The inventory mapping is:

| Zone | Machine IDs | Count |
| --- | --- | ---: |
| A-407 | PC-001 through PC-050 | 50 |
| A-412 | PC-051 through PC-100 | 50 |
| A-410 | PC-101 through PC-150 | 50 |
| ชั้น-3 | PC-151 through PC-171 | 21 |
| DLP | PC-172 through PC-201 | 30 |
| ศูนย์อีสาน | PC-202 through PC-203 | 2 |

## Recommended approach

Keep the zone mapping in application code as a single, tested source of truth. Derive a machine's zone from its machine ID when returning inventory and when building reports.

This avoids introducing a new Google Sheets tab or changing the existing `Sessions` and `Events` schemas. Existing historical rows continue to work because they already contain the machine ID. The mapping is treated as fixed for this rollout; changing a physical machine's zone later would require an explicit versioned mapping decision.

## Components and data flow

1. Add a zone registry module containing the six ordered ID ranges and a lookup function.
2. Extend `MachineView` with a `zone` field. `/api/machines` attaches the resolved zone to all 203 machines.
3. Extend monthly report rows with `zone` and add a zone summary containing zone name, inventory count, session count, and total hours.
4. Extend monthly CSV rows with a `zone` column while preserving the existing user/machine/session/hour columns.
5. Update the Admin dashboard to filter the machine list by zone and show per-zone inventory and monthly usage summaries.
6. Keep check-in, heartbeat, client poll, shutdown, and Google Sheets writes keyed by machine ID. The existing machine validation remains the authority for `PC-001` through `PC-203`.

## Compatibility and error handling

- No migration is required for existing `Sessions`, `Events`, or `Admins` tabs.
- A known machine always resolves to exactly one zone.
- Unknown machine IDs remain rejected by the existing 404/401 paths; the zone lookup must not make unknown IDs valid.
- Report calculations keep their existing month-overlap and rounding behavior.
- The API additions are additive: existing report fields remain available, with zone fields added alongside them.

## Testing

- Zone lookup accepts each range boundary and rejects `PC-204`.
- The six zone counts sum to 203 and the inventory endpoint returns the correct first/last machine for each zone.
- Monthly reporting assigns sessions to the correct zones and aggregates session counts/hours per zone.
- Machine API responses include the expected zone.
- CSV export includes the zone header/value without breaking existing columns.
- Existing authentication, session, shutdown, Google Sheets, and Admin tests continue to pass.

## Rollout notes

The Next.js runtime remains the active server. Configure the two new WPF clients with `MachineId` values `PC-202` and `PC-203`; no new Sheet columns are needed.
