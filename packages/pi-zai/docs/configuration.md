# Configuration

## Settings file

Project: `.pi/settings.json`  
Global: `~/.pi/agent/settings.json` (via Pi `getAgentDir()`)

```json
{
  "zai": {
    "preserveThinking": false,
    "statusTps": true,
    "statusTpsAvg": false
  }
}
```

Project settings override global settings.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ZAI_API_KEY` | Z.AI key for `zai` and `zai-platform` (via Pi auth resolution) |
| `ZAI_CODING_CN_API_KEY` | Coding Plan CN key |
| `PI_ZAI_PRESERVE_THINKING` | `1`/`true`/`yes` to enable preserved thinking |
| `PI_ZAI_STATUS_TPS` | `0`/`false` to hide footer throughput (`setStatus`) |
| `PI_ZAI_STATUS_TPS_AVG` | `1`/`true` to show session average next to last TPS |

Credentials resolve through Pi's `ModelRegistry`: `auth.json`, `models.json`, runtime `--api-key`, then env vars. The extension registers `zai-platform` with `apiKey: "$ZAI_API_KEY"` — the same pattern as built-in `zai`.

`PI_ZAI_PRESERVE_THINKING` overrides settings file when set.

## Platform model catalog

Registered by this extension on `zai-platform`:

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
2. re-syncs provider registration (preserve thinking overrides)
3. keeps cache metrics unless a new session starts

## Session lifecycle hooks

| Hook | Behavior |
|------|----------|
| `session_start` | Init state; reset cache on new session |
| `model_select` | Update endpoint and credential source |
| `before_agent_start` | Update cache segment fingerprints |
| `message_start` / `message_update` / `message_end` | Track assistant throughput (TPS, TTFT) |
| `turn_end` | Record usage metrics |
| `session_before_compact` | Inject Z.AI compaction instructions |
| `session_before_tree` | Inject Z.AI branch summary instructions |
| `session_compact` | Mark compaction timestamp |
| `before_provider_request` | Enforce `clear_thinking` when cost-first |
