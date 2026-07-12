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
- Coding Plan: `subscription-managed`

## `/zai-doctor`

Offline integration checks:

- GLM-5.2 thinking level map
- Platform pricing metadata
- compaction policy presence
- fingerprint utilities
- optional live `/models` probe when credentials exist

Network probes use configured auth headers and omit secrets from output.
