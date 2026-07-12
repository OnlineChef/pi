# Security and privacy

pi-zai is a Z.AI-only Pi extension. This page describes what data leaves your machine, what stays local, and how to control it.

## Summary

| Layer | Status | Where data goes |
|-------|--------|-----------------|
| **Z.AI API** | Always (when you chat) | Prompts and completions to Z.AI per Pi's normal provider flow |
| **Local metrics** | On by default (`zai.metrics.mode: local`) | SQLite on your machine only |
| **Remote telemetry** | **Opt-in** (default off) | Anonymous daily aggregates to Online Chef Groep when enabled |

**Remote telemetry is off by default in v0.3.0.** Enable via settings + `/zai-telemetry enable`. See [Architecture — remote telemetry](architecture.md#3-remote-telemetry-opt-in-v030).

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
| `/zai-privacy preview` | Allowlist, never-remote fields, remote telemetry mode |
| `/zai-telemetry status` | Mode, consent, pending upload days |
| `/zai-telemetry enable` | Opt-in confirm (requires `telemetry.mode: aggregate`) |
| `/zai-telemetry disable` | Remove consent file |
| `/zai-telemetry preview [day]` | Local aggregate JSON for a UTC day (not sent) |
| `/zai-telemetry upload [day]` | Upload one completed day |
| `/zai-telemetry sync` | Upload all pending completed days |

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

**pi-zai uploads metrics only when you opt in** (`zai.telemetry.mode: aggregate` + `/zai-telemetry enable`). Default is no remote uploads.

## Remote telemetry (opt-in)

Default: `zai.telemetry.mode: "off"`. When enabled:

1. Set `"telemetry": { "mode": "aggregate" }` in settings and `/reload`
2. Run `/zai-telemetry enable` and confirm the prompt
3. Completed UTC days upload on session start or `/zai-telemetry sync`

Consent file: `~/.pi/agent/state/pi-zai/telemetry.consent.json`. Disable with `/zai-telemetry disable` (settings mode unchanged).

### Uploaded fields (allowlist)

| Field | Purpose |
|-------|---------|
| `day` | UTC date |
| `extensionVersion`, `promptMode` | Build and stability mode |
| `attempts`, `errors` | Daily counts |
| Token counters | `input`, `cacheRead`, `cacheWrite`, `output` |
| `turnBucket`, `cacheRatioBucket`, `retryRateBucket` | Bucketed bands only |
| `byProviderModel[]` | Provider/model/endpoint counts |
| `errorCategories{}` | Controlled category labels |

### Never uploaded

- Prompts, code, paths, install IDs, API keys
- Project/session/query IDs, fingerprints
- Raw provider error bodies
- IP address as an application field

`/zai-privacy preview` shows a local aggregate sketch. Status is `preview-only-not-sent` until mode + consent are active (`aggregate-ready`).

Ingest: `POST https://api.chefgroep.online/pi-zai/telemetry/v1/aggregate` (Cloudflare Worker → Analytics Engine). Override URL with `zai.telemetry.ingestUrl` for staging.

Optional encrypted diagnostic bundles (preview + confirm) are a separate later phase.

## Benchmark data

`/zai-benchmark` stores run manifests and completed reports in the same local SQLite database (`benchmark_runs` table). Reports contain aggregated usage/transport/cache stats for the benchmark window — not prompt content.

## Boundary tests

The package includes source-level tests that assert:

- Remote `fetch` isolated to `telemetry/uploader.ts`
- Privacy preview does not call the network
- `zai-telemetry` command and aggregate mode registered in config
