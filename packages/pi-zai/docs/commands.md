# Commands

All commands require an active Z.AI model unless noted.

## `/zai`

Status dashboard:

- provider, endpoint, model
- native thinking level
- `clear_thinking` and preserved thinking state
- tool streaming flag
- credential source name (never the key value)
- last usage line
- cache hit ratios and session cost
- prompt stability (stable/volatile line counts, fingerprint)

## `/zai-endpoint coding|platform`

Switch endpoint by selecting the default model on the target provider via Pi's native `setModel`.

```text
/zai-endpoint coding
/zai-endpoint platform
```

No hidden endpoint state — the active endpoint always matches the selected model.

## `/zai-cache [status|reset-stats|explain]`

Implicit cache diagnostics.

| Action | Description |
|--------|-------------|
| `status` (default) | Segment key, token breakdown, ratios, cost, recommendations |
| `reset-stats` | Clear local telemetry; does not invalidate server cache |
| `explain` | How Z.AI implicit caching works in Pi |

## `/zai-usage`

Session usage totals with Z.AI interpretation:

- uncached input, cacheRead, cacheWrite, output
- hit ratio
- Platform: estimated dollar cost
- Coding Plan: `subscription-managed` plus live quota (5h / weekly / MCP) from monitor API

## `/zai-doctor`

Offline integration checks:

- GLM-5.2 thinking level map (when `reasoning_effort` supported)
- Platform pricing metadata
- compaction policy presence
- fingerprint utilities
- cache affinity header (`X-Session-Id`)
- connection stability probe (3 chat completions)
- Pi retry settings advice
- optional live `/models` probe when credentials exist

Network probes use configured auth headers and omit secrets from output.

## `/zai-data [action]`

Local Z.AI attempt metrics (SQLite by default). See [Security](security.md) for the field allowlist.

| Action | Description |
|--------|-------------|
| `status` (default) | Storage kind, paths, row counts, project/session hashes |
| `clear-project` | Delete metrics for the current project hash |
| `clear-details` | Delete detail rows; keep daily rollups |
| `clear-benchmarks` | Delete benchmark run rows |
| `clear-all` | Wipe all pi-zai metrics and rotate `local.secret` |
| `export-json <path>` | Export attempts for current project |
| `export-csv <path>` | CSV export |
| `vacuum` | SQLite maintenance |

## `/zai-transport`

Local transport summary for the current project: attempt count, error count, average latency (headers, first delta, total), and error categories. No raw error bodies.

## `/zai-privacy preview`

Local privacy report: SQLite allowlist, never-remote fields, remote telemetry mode, and aggregate JSON preview (sent only when mode + consent are active). Default action is `preview`.

## `/zai-telemetry [action]`

Opt-in anonymous daily aggregate uploads. Requires `zai.telemetry.mode: aggregate` in settings.

| Action | Description |
|--------|-------------|
| `status` (default) | Mode, consent file, ingest URL, pending UTC days |
| `preview [day]` | Local aggregate JSON for a day (not sent) |
| `enable` | Confirm opt-in; writes consent file |
| `disable` | Remove consent; stops uploads |
| `upload [day]` | Upload one completed UTC day |
| `sync` | Upload all pending completed days |

## `/zai-benchmark [action]`

A0–A3 cache benchmark harness and local run tracking.

| Action | Description |
|--------|-------------|
| `manifest` (default) | Variants, scenarios, sample gates |
| `instructions <A0–A3> [scenario]` | Setup steps and settings JSON |
| `start <A1\|A2\|A3> [scenario]` | Begin a tracked run (records `attemptsBaseline`) |
| `complete [run-id]` | Finish active run and print gate report |
| `status` | Recent runs and active run id |
| `report [run-id]` | Show stored report |
| `gates` | Completed runs vs sample targets |

A0 is native Pi without pi-zai; use it as control outside this extension.

## Benchmark (live script)

From `packages/pi-zai` after build:

```bash
export ZAI_API_KEY='...'
npm run benchmark:cache-affinity
```

Compares warm-turn cache hit rate: stable `X-Session-Id` vs none vs rotating (anti-affinity control). Optional JSON via `PI_ZAI_AB_OUTPUT`.
