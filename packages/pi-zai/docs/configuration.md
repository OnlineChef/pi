# Configuration

## Settings file

Project: `.pi/settings.json`  
Global: `~/.pi/agent/settings.json` (via Pi `getAgentDir()`)

```json
{
  "zai": {
    "preserveThinking": false,
    "statusTps": true,
    "statusTpsAvg": false,
    "sessionAffinity": "off",
    "promptStability": { "mode": "observe" },
    "metrics": {
      "mode": "local",
      "retentionDays": 30,
      "rollupRetentionDays": 180,
      "maxDatabaseBytes": 33554432
    },
    "telemetry": {
      "mode": "off",
      "ingestUrl": "https://api.chefgroep.online/pi-zai/telemetry/v1/aggregate"
    }
  }
}
```

Project settings override global settings. pi-zai does not read `PI_ZAI_*` environment variables.

How metrics and telemetry fit together: [Architecture](architecture.md). Allowlists and wipe commands: [Security](security.md).

## Telemetry

| Setting | Default | Notes |
|---------|---------|-------|
| `telemetry.mode` | `off` | `aggregate` allows uploads after `/zai-telemetry enable` |
| `telemetry.ingestUrl` | production URL | Override for staging or self-hosted worker |

Consent is stored separately at `~/.pi/agent/state/pi-zai/telemetry.consent.json`. `/zai-telemetry disable` removes it without changing settings.

## Credentials (Pi native)

| Variable | Purpose |
|----------|---------|
| `ZAI_API_KEY` | Z.AI key for built-in `zai` (via Pi auth resolution) |
| `ZAI_CODING_CN_API_KEY` | Coding Plan CN key |

Credentials resolve through Pi's `ModelRegistry`: `auth.json`, `models.json`, runtime `--api-key`, then env vars. pi-zai **does not** register or override Pi's built-in `zai` / `zai-coding-cn` providers.

## Platform API (optional)

pi-zai does **not** auto-register `zai-platform`. Add it manually in `models.json` if you need metered Platform billing. Use `buildPlatformModelCatalog()` from the package or copy models from [model-catalog.ts](../src/model-catalog.ts).

| Model | Context | Notes |
|-------|---------|-------|
| `glm-5.2` | 1M | Native `off`/`high`/`max` thinking |
| `glm-5.1` | 200K | Tool streaming |
| `glm-5` | 200K | |
| `glm-5-turbo` | 200K | |
| `glm-4.7` | 204.8K | |
| `glm-4.7-flashx` | 200K | |
| `glm-4.5-air` | 131K | |

Pricing metadata follows [Z.AI pricing docs](https://docs.z.ai/guides/overview/pricing.md) (USD per 1M tokens).

## Reload behavior

On `/reload`, the extension:

1. reloads `zai` settings from disk
2. keeps Pi's native provider registry unchanged
3. keeps cache metrics unless a new session starts

## Session lifecycle hooks

| Hook | Behavior |
|------|----------|
| `session_start` | Init state; load settings; reset cache on new session; sync pending telemetry when opted in |
| `model_select` | Update endpoint and credential source |
| `before_agent_start` | Update cache segment fingerprints |
| `message_start` / `message_update` / `message_end` | Track assistant throughput (TPS, TTFT) |
| `turn_end` | Record usage metrics to local storage |
| `session_before_compact` | Inject Z.AI compaction instructions |
| `session_before_tree` | Inject Z.AI branch summary instructions |
| `session_compact` | Mark compaction timestamp |
| `before_provider_request` | Normalize Z.AI `thinking` / `clear_thinking` from settings |
| `before_provider_headers` | Optional `X-Session-Id` when `sessionAffinity=experimental` |
