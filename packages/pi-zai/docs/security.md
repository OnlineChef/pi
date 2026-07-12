# Security and privacy

pi-zai is a Z.AI-only Pi extension. This page describes what data leaves your machine, what stays local, and how to control it.

## Summary

| Layer | Status | Where data goes |
|-------|--------|-----------------|
| **Z.AI API** | Always (when you chat) | Prompts and completions to Z.AI per Pi's normal provider flow |
| **Local metrics** | On by default (`zai.metrics.mode: local`) | SQLite on your machine only |
| **Remote telemetry** | **Not shipped** | No uploader, no Worker, no opt-in — `zai.telemetry.mode` is always `off` |

**Remote telemetry is not ready in v0.2.0.** Only a local preview exists. See [Architecture — remote telemetry](architecture.md#3-remote-telemetry-not-shipped).

Inspect your setup anytime:

```text
/zai-privacy preview
/zai-data status
```

## Credentials

- API keys resolve through Pi's `ModelRegistry`, `auth.json`, `models.json`, runtime `--api-key`, and env vars (`ZAI_API_KEY`, `ZAI_CODING_CN_API_KEY`).
- The extension **never prints key values** in commands, logs, or diagnostics.
- `/zai` and `/zai-doctor` show credential **source names** only (for example `ZAI_API_KEY`, `auth.json`).

### Resolution order (Pi native)

1. Runtime `--api-key`
2. `auth.json` for the active provider
3. Provider `apiKey` from `models.json`
4. Environment variable

pi-zai does not add separate env precedence or shell helpers.

### Local credential files

If you store keys outside Pi:

```bash
chmod 700 ~/.config/zai
chmod 600 ~/.config/zai/credentials.env
```

Never commit credential files. Rotate keys if exposed in chat, logs, or screenshots.

## Local metrics storage

Default: `zai.metrics.mode: "local"`. Each Z.AI provider attempt can be recorded locally as a privacy-reduced row.

### Files

```text
~/.pi/agent/state/pi-zai/metrics.sqlite3
~/.pi/agent/state/pi-zai/local.secret
```

- `local.secret` — random 256-bit key for HMAC project IDs. **Never sent remotely.**
- `projectId` — `HMAC(localSecret, canonicalCwd)`. Not a reversible path hash.
- `sessionHash` — hash of Pi session id. Local only.

### Stored per attempt (allowlist)

| Field | Purpose |
|-------|---------|
| `occurredAt` | Timestamp |
| `projectId`, `sessionHash` | Local pseudonymous correlation |
| `queryId`, `requestId`, `attempt` | Retry/correlation (no prompt content) |
| `provider`, `model`, `endpointKind` | Z.AI routing context |
| `thinkingLevel`, `extensionVersion` | Config context |
| `systemFingerprint`, `toolsetFingerprint`, `payloadFingerprint` | Short hashes only — **local SQLite only** |
| Token counters | `input`, `cacheRead`, `cacheWrite`, `output` |
| Latency | `requestToHeadersMs`, `requestToFirstDeltaMs`, `totalMs` |
| `httpStatus`, `errorCategory` | Controlled category labels — no raw error bodies |
| `estimatedApiCostMicrousd` | Derived from usage metadata |

### Never stored (local or remote)

- Prompts, code, reasoning, tool output
- API keys, filesystem paths, hostnames, repository names
- Raw provider error message bodies
- Install IDs or reversible project paths

### Modes

| `zai.metrics.mode` | Behavior |
|--------------------|----------|
| `off` | No attempt records |
| `memory` | In-process only; lost on shutdown |
| `local` | SQLite with memory fail-open if the database cannot open |

Retention: `retentionDays`, `rollupRetentionDays`, `maxDatabaseBytes` in settings. Old detail rows roll up to daily summaries before deletion.

### Operator commands

| Command | Action |
|---------|--------|
| `/zai-data status` | Storage kind, row counts, project hash |
| `/zai-data export-json <path>` | Export attempts for current project |
| `/zai-data export-csv <path>` | CSV export |
| `/zai-data clear-project` | Delete metrics for current project hash |
| `/zai-data clear-details` | Delete detail rows; keep rollups |
| `/zai-data clear-benchmarks` | Delete benchmark run rows |
| `/zai-data clear-all` | Wipe all local pi-zai metrics **and rotate** `local.secret` |
| `/zai-data vacuum` | SQLite maintenance |
| `/zai-transport` | Local latency and error-category summary |
| `/zai-privacy preview` | Allowlist, never-remote list, disabled remote mode |

## Prompt fingerprinting

- System prompts are canonicalized (whitespace, volatile patterns) before hashing.
- Raw prompt text is **never** written to SQLite, exports, or command output.
- `/zai` and `/zai-cache` show short fingerprints only.

With `zai.promptStability.mode: "safe"`, content below an explicit `--- dynamic context ---` marker may be normalized before send and fingerprinting. See [Cache optimization](cache-optimization.md).

## Preserve thinking

`zai.preserveThinking: true` replays historical reasoning in Z.AI API requests. That sends more data to Z.AI and may include sensitive intermediate reasoning. Default is `false`.

## Network probes

`/zai-doctor` may call `${baseUrl}/models` with configured auth. Response status is shown; bodies and secrets are not logged.

`/zai-usage` calls Z.AI monitor APIs for Coding Plan quota when credentials exist.

**No pi-zai code uploads metrics to Online Chef Groep or third-party telemetry endpoints in the current release.**

## Remote telemetry (not implemented)

`zai.telemetry.mode` is hardcoded to `"off"`. Settings cannot enable uploads.

`/zai-privacy preview` may show a **preview-only** JSON bucket sketch (`status: preview-only-not-sent`). That object is rendered locally and **never transmitted**.

### Planned opt-in aggregate telemetry (future release)

When implemented:

- Explicit opt-in only (default off)
- Anonymous daily buckets only (turn counts, cache-ratio bands, error categories)
- No prompts, code, paths, install IDs, or fingerprints
- Ingest via Cloudflare Worker to Analytics Engine (no direct client access to D1/R2)

Optional encrypted diagnostic bundles (preview + confirm) are a separate later phase.

## Benchmark data

`/zai-benchmark` stores run manifests and completed reports in the same local SQLite database (`benchmark_runs` table). Reports contain aggregated usage/transport/cache stats for the benchmark window — not prompt content.

## Boundary tests

The package includes source-level tests that assert:

- No remote telemetry `fetch` URLs in extension code
- `telemetryMode` forced off in config loader
- Privacy preview does not call the network
