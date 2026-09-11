# Zone rollout guide

The active Next.js server exposes 203 machines and assigns each machine to one fixed library zone:

| Zone | Machine IDs | Count |
| --- | --- | ---: |
| A-407 | PC-001 through PC-050 | 50 |
| A-412 | PC-051 through PC-100 | 50 |
| A-410 | PC-101 through PC-150 | 50 |
| ชั้น-3 | PC-151 through PC-171 | 21 |
| DLP | PC-172 through PC-201 | 30 |
| ศูนย์อีสาน | PC-202 through PC-203 | 2 |

## New client machines

Configure the two new WPF clients with these IDs in `clientsettings.json`:

- The client in the first new seat uses `PC-202`.
- The client in the second new seat uses `PC-203`.

Keep `ServerBaseUrl` and `ClientKey` the same as the other clients. The server validates the IDs and the Admin dashboard discovers the zone automatically.

## Google Sheets

No new tab or columns are required. Existing `Sessions`, `Events`, and `Admins` rows remain unchanged; zone usage is derived from each stored `machine_id`.

## Reports

The monthly JSON report includes `zone` on each machine row and a `zoneRows` summary containing inventory count, session count, and hours for each zone. CSV exports use this column order:

```text
month,zone,user_email,machine_id,session_count,hours
```

The Admin dashboard's zone selector filters the live machine list, while the monthly zone cards use the selected month's report data.
