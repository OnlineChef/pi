# Architecture

How pi-zai fits into Pi, what it measures locally, and what is **not** shipped yet.

## Role in the stack

pi-zai is a **Pi extension** for Z.AI only. It does not replace Pi's agent runtime, streaming, tool loop, or thinking UI.

```text
You  →  Pi (agent, tools, sessions)
         ↓
       Pi native Z.AI providers (zai, zai-coding-cn, optional zai-platform)
         ↓
       Z.AI API
         ↑
       pi-zai hooks (cache metrics, thinking payload, headers, local SQLite)
```

| Layer | Owner | pi-zai role |
|-------|--------|-------------|
| Chat & tools | Pi | None — uses Pi as-is |
| HTTP to Z.AI | Pi providers | Normalizes thinking fields via `before_provider_request` |
| Cache visibility | pi-zai | Fingerprints, segment tracking, `/zai-cache` |
| Operator UX | pi-zai | `/zai`, `/zai-doctor`, `/zai-usage`, metrics commands |
| Local history | pi-zai | Privacy-reduced attempt rows in SQLite |

**Breaking change in 0.2.0:** pi-zai no longer registers or overrides Pi's built-in `zai` / `zai-coding-cn` providers. Add `zai-platform` yourself in `models.json` if you need metered Platform billing.

## Request lifecycle (one Z.AI turn)

1. **`before_agent_start`** — Start attempt timing; fingerprint system prompt + tools; optional safe-prompt rewrite below `--- dynamic context ---`.
2. **`before_provider_request`** — Map Pi thinking level to Z.AI `thinking` / `clear_thinking` / `reasoning_effort`.
3. **`before_provider_headers`** — Set `User-Agent: pi-zai/<version>`; optional `X-Session-Id` when `sessionAffinity: experimental`.
4. **Pi provider stream** — Normal Z.AI traffic (prompts and completions leave your machine here).
5. **`after_provider_response`** — Record HTTP status for transport metrics.
6. **`message_update` / `message_end`** — TPS / TTFT for footer status.
7. **`turn_end`** — Write privacy-reduced attempt row to local storage (tokens, latency, error category, local fingerprints).

Compaction and branch-summary hooks inject Z.AI-focused instructions without changing Pi's compaction engine.

## Three data paths

### 1. Z.AI API (always when you chat)

Everything required for inference goes to Z.AI through Pi's providers: messages, tools, thinking configuration. This is standard Pi behavior; pi-zai does not add a second API client for chat.

Other Z.AI HTTP calls from pi-zai (not chat uploads):

| Call | Command | Purpose |
|------|---------|---------|
| `GET /models` | `/zai-doctor` | Optional connectivity probe |
| Monitor API | `/zai-usage` | Coding Plan quota windows |
| `POST /chat/completions` | `/zai-doctor` | Stability probe (3 short requests) |

Secrets and response bodies are not printed.

### 2. Local metrics (on by default)

**Setting:** `zai.metrics.mode` — default `local`.

**Storage:**

```text
~/.pi/agent/state/pi-zai/metrics.sqlite3
~/.pi/agent/state/pi-zai/local.secret
```

Each completed Z.AI attempt can produce one row: token counts, latency, HTTP status, controlled error category, local HMAC project/session hashes, short fingerprints. **No prompt or code text.**

Retention is bounded (`retentionDays`, `maxDatabaseBytes`). Detail rows roll up to daily summaries before deletion.

**Operator surface:** `/zai-data`, `/zai-transport`, `/zai-benchmark` (local run manifests).

Full allowlist: [Security](security.md).

### 3. Remote telemetry (not shipped)

**Setting:** `zai.telemetry.mode` — **hardcoded `"off"`** in code. User settings cannot enable uploads in v0.2.0.

| Piece | v0.2.0 status |
|-------|----------------|
| Client daily uploader | **Not built** |
| `telemetry.mode: aggregate` | **Not available** (forced off) |
| `/zai-telemetry` commands | **Not built** |
| Opt-in UI / settings flow | **Not built** |
| Cloudflare Worker ingest | **Not built** |
| Analytics Engine / D1 backend | **Not built** |
| Privacy preview JSON | **Built** — local display only (`preview-only-not-sent`) |
| Boundary tests (no upload URLs) | **Built** |

`/zai-privacy preview` shows what a **future** opt-in aggregate payload could look like (bucketed counts only). That JSON is rendered in the terminal and **never sent**.

#### Planned remote design (PR #4+, not implemented)

When built:

- Explicit opt-in (default off)
- Daily anonymous aggregates only: turn buckets, cache-ratio bands, error category counts
- Never: prompts, code, fingerprints, install IDs, paths, raw errors
- Ingest via Cloudflare Worker → Analytics Engine (no direct client access to D1/R2)

Encrypted diagnostic bundles (preview + confirm) are a separate optional later phase (PR #5).

## Configuration surfaces

| Surface | Scope |
|---------|--------|
| `.pi/settings.json` (project) | Overrides global `zai.*` |
| `~/.pi/agent/settings.json` | Global defaults |
| Env vars | Pi credential resolution only — **no `PI_ZAI_*` overrides** |

See [Configuration](configuration.md).

## Benchmark variants (A0–A3)

Used to compare cache strategies before changing defaults:

| Variant | pi-zai loaded | Distinction |
|---------|---------------|-------------|
| A0 | No | Native Pi control |
| A1 | Yes | Observe prompt stability |
| A2 | Yes | + safe prompt normalization |
| A3 | Yes | + experimental `X-Session-Id` |

Track runs with `/zai-benchmark start` … `complete`. Live script: `npm run benchmark:cache-affinity` (see [Development](development.md)).

## Related docs

- [Security](security.md) — allowlists, wipe commands, credential rules
- [Cache optimization](cache-optimization.md) — hit ratio and fingerprints
- [Commands](commands.md) — slash reference
- [Development](development.md) — build, test, release
