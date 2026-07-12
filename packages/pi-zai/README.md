# @onlinechefgroep/pi-zai

**Z.AI for Pi** — cache intelligence, cost-first thinking, local operator metrics, and production diagnostics on top of Pi's native Z.AI providers.

Works with Pi **>= 0.80.0**. Current version: **0.3.0**.

## Why pi-zai

- **See your cache** — implicit prefix reuse, segment fingerprints, low-hit recommendations ([Z.AI caching](https://docs.z.ai/guides/capabilities/cache.md)).
- **Spend less by default** — `clear_thinking=true`, no historical reasoning replay unless you opt in.
- **Operate with confidence** — `/zai-doctor`, quota via `/zai-usage`, connection hints, local latency summaries.
- **Privacy-first metrics** — SQLite on your machine; **opt-in** remote aggregates only when you enable them.

pi-zai **extends** Pi's native `zai` / `zai-coding-cn` path. It does not replace Pi's runtime, streaming, or thinking controls.

## Quick start

```bash
pi install npm:@onlinechefgroep/pi-zai
/reload
```

Set credentials the Pi way (`/login`, `auth.json`, `models.json`, or `ZAI_API_KEY`), select a Z.AI model, then:

```text
/zai
/zai-doctor
/zai-cache status
/zai-privacy preview
```

[Full getting started guide](docs/getting-started.md)

## What you get

| Area | What pi-zai adds |
|------|------------------|
| **Cache** | Segment fingerprints, hit ratio, compaction policy, optional `X-Session-Id` affinity |
| **Thinking** | Maps Pi `off` / `high` / `max` → Z.AI payload via hooks (GLM-5.2) |
| **Quota & cost** | Coding Plan monitor + Platform cost estimates in `/zai-usage` |
| **Resilience** | Doctor probes, retry guidance, connection-error hints |
| **Local metrics** | Token/latency/error records in SQLite (`/zai-data`, `/zai-transport`) |
| **Benchmarks** | A0–A3 manifest + `/zai-benchmark` run tracking |
| **Platform API** | Catalog helpers — register `zai-platform` in `models.json` yourself |

## Privacy promise (v0.3.0)

| Data path | Status |
|-----------|--------|
| Z.AI API (chat) | Normal Pi provider traffic when you use Z.AI |
| Local metrics | On by default — counts & hashes only, **no prompts/code** |
| Remote telemetry | **Off by default** — opt-in daily anonymous aggregates |

```text
/zai-privacy preview    # allowlist + aggregate preview (not sent until enabled)
/zai-telemetry status   # mode, consent, pending upload days
/zai-data status        # local SQLite row counts
/zai-data clear-all     # wipe metrics + rotate local project secret
```

Details: [Security & privacy](docs/security.md) · [Architecture](docs/architecture.md)

## Endpoints

| Provider | URL | Billing |
|----------|-----|---------|
| `zai` | `api.z.ai/.../coding/paas/v4` | Coding Plan |
| `zai-coding-cn` | `open.bigmodel.cn/.../coding/paas/v4` | Coding Plan (CN) |
| `zai-platform` | `api.z.ai/.../paas/v4` | Metered |

Switch: `/zai-endpoint coding|platform` or Pi model picker.

## Configuration (essentials)

```json
{
  "zai": {
    "preserveThinking": false,
    "sessionAffinity": "off",
    "promptStability": { "mode": "observe" },
    "metrics": { "mode": "local" },
    "telemetry": { "mode": "off" }
  }
}
```

| Setting | Default | Notes |
|---------|---------|-------|
| `metrics.mode` | `local` | `off` / `memory` / `local` SQLite |
| `telemetry.mode` | `off` | `aggregate` enables uploads after `/zai-telemetry enable` |
| `sessionAffinity` | `off` | `experimental` → `X-Session-Id` header |
| `promptStability.mode` | `observe` | `safe` normalizes below dynamic marker |

[Full configuration](docs/configuration.md)

## Documentation

| Guide | Topic |
|-------|-------|
| [Getting started](docs/getting-started.md) | Install, credentials, first session |
| [Architecture](docs/architecture.md) | How pi-zai fits Pi, data paths, telemetry readiness |
| [Security](docs/security.md) | Allowlists, wipe commands, remote boundary |
| [Cache optimization](docs/cache-optimization.md) | Hit ratio, fingerprints, recommendations |
| [Thinking](docs/thinking.md) | Native levels, preserve opt-in |
| [Commands](docs/commands.md) | All slash commands |
| [Configuration](docs/configuration.md) | Settings reference |
| [Troubleshooting](docs/troubleshooting.md) | Connection, cache, auth issues |
| [Development](docs/development.md) | Build, test, benchmark scripts |

## Is remote telemetry ready?

**Yes, opt-in.** v0.3.0 ships the client uploader, `/zai-telemetry`, and a Cloudflare Worker scaffold. Default is off. Enable with `zai.telemetry.mode: aggregate` + `/zai-telemetry enable`. Production ingest requires deploying `worker/telemetry/` and binding the route on `api.chefgroep.online`. See [Architecture](docs/architecture.md#3-remote-telemetry-opt-in-v030).

## Development

```bash
cd packages/pi-zai && npm run build && npm test
```

[Development guide](docs/development.md) · Peer: `@earendil-works/pi-coding-agent >= 0.80.0`

## License

MIT — [LICENSE](LICENSE)
