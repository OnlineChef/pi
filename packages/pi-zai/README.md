# @onlinechefgroep/pi-zai

Production-grade [Z.AI](https://docs.z.ai) integration for [Pi](https://github.com/earendil-works/pi): Platform API provider, implicit cache optimization, cost-first thinking defaults, and operator commands.

This extension completes Pi's **native** Z.AI path. It does not replace Pi's model runtime, streaming stack, or thinking controls.

## Quick start

```bash
# Requires Pi >= 0.80.0
pi install npm:@onlinechefgroep/pi-zai
/reload
```

Set credentials through Pi's normal auth paths (`/login`, `auth.json`, `models.json`, or `ZAI_API_KEY`):

```bash
export ZAI_API_KEY='...'   # used by zai and zai-platform
```

Select a Z.AI model in Pi, then verify:

```text
/zai
/zai-doctor
/zai-cache status
```

## What you get

| Feature | Description |
|---------|-------------|
| Platform provider | Catalog helpers only; register `zai-platform` yourself via `models.json` |
| Cache optimizer | Tracks implicit prefix reuse; `X-Session-Id` affinity for warm nodes |
| Coding Plan quota | `/zai-usage` shows 5h / weekly / MCP budget from monitor API |
| Cost-first thinking | `clear_thinking=true` by default; no historical reasoning replay |
| Compaction policy | Z.AI-aware summary structure; drops hidden reasoning |
| Connection resilience | Doctor probes, retry advice, hints after connection errors |
| Operator commands | `/zai`, `/zai-endpoint`, `/zai-cache`, `/zai-usage`, `/zai-doctor`, `/zai-data`, `/zai-transport`, `/zai-privacy`, `/zai-benchmark` |
| Local metrics | Privacy-reduced Z.AI attempt records in local SQLite (default on) |
| Remote telemetry | Disabled — no uploads (`zai.telemetry.mode` always `off`) |

## Documentation

| Guide | Topic |
|-------|-------|
| [Getting started](docs/getting-started.md) | Install, credentials, first session |
| [Cache optimization](docs/cache-optimization.md) | Implicit caching, fingerprints, recommendations |
| [Thinking](docs/thinking.md) | Native Pi levels, payload mapping, preserve opt-in |
| [Commands](docs/commands.md) | Slash command reference |
| [Configuration](docs/configuration.md) | Settings, env vars, endpoints |
| [Troubleshooting](docs/troubleshooting.md) | Common failures and fixes |
| [Security](docs/security.md) | Credentials, local metrics allowlist, remote telemetry boundary |

## Native thinking

Thinking is **entirely native to Pi**. There is no `/zai-thinking` command.

For GLM-5.2, Pi exposes exactly: `off`, `high`, `max`.

| Pi level | Z.AI payload |
|----------|----------------|
| `off` | `thinking.type = "disabled"`, `clear_thinking = true` |
| `high` | `thinking.type = "enabled"`, `reasoning_effort = "high"`, `clear_thinking = true` |
| `max` | `thinking.type = "enabled"`, `reasoning_effort = "max"`, `clear_thinking = true` |

Preserved thinking replay is a separate opt-in. See [Thinking](docs/thinking.md).

## Endpoints

| Provider | Endpoint | Billing |
|----------|----------|---------|
| `zai` | `https://api.z.ai/api/coding/paas/v4` | Subscription |
| `zai-coding-cn` | `https://open.bigmodel.cn/api/coding/paas/v4` | Subscription (CN) |
| `zai-platform` | `https://api.z.ai/api/paas/v4` | Metered per model |

Switch with Pi model selection or `/zai-endpoint coding|platform`.

## Cache at a glance

Z.AI reuses repeated prompt prefixes automatically ([official docs](https://docs.z.ai/guides/capabilities/cache.md)). This extension:

- fingerprints stable system prompts and toolsets
- maps `usage.cacheRead` to cached tokens
- resets metrics on provider, endpoint, model, or fingerprint changes
- surfaces recommendations when hit ratio is low

Hit ratio:

```text
cacheRead / (input + cacheRead + cacheWrite)
```

Details: [Cache optimization](docs/cache-optimization.md).

## Configuration

```json
{
  "zai": {
    "preserveThinking": false
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `zai.preserveThinking` | `false` | Replay historical reasoning; reduces cache efficiency |
| `zai.statusTps` | `true` | Show last throughput in Pi footer |
| `zai.sessionAffinity` | `off` | `experimental` enables `X-Session-Id` header |
| `zai.metrics.mode` | `local` | `off` / `memory` / `local` SQLite metrics |
| `zai.telemetry.mode` | `off` | Hardcoded off — no remote uploads |
| `zai.promptStability.mode` | `observe` | `off` / `observe` / `safe` (normalize below dynamic marker) |

## Privacy at a glance

- **Z.AI API**: normal Pi provider traffic when you chat.
- **Local metrics** (default): token counts, latency, error categories, short fingerprints — SQLite under `~/.pi/agent/state/pi-zai/`.
- **Never stored**: prompts, code, reasoning, paths, keys, raw error bodies.
- **Remote telemetry**: not implemented; `/zai-privacy preview` shows what a future opt-in aggregate *could* look like (never sent).

```text
/zai-privacy preview
/zai-data status
/zai-data clear-all   # wipe + rotate local project secret
```

Details: [Security](docs/security.md).

## Development

```bash
cd packages/pi-zai
npm run build
npm test
npm pack --dry-run
```

Peer dependency: `@earendil-works/pi-coding-agent >= 0.80.0`.

## License

MIT — see [LICENSE](LICENSE).
