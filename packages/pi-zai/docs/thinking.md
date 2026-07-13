# Thinking

Thinking is controlled **natively by Pi**. This extension does not add thinking commands or extension-owned thinking state.

## GLM-5.2 levels

Pi exposes three effective levels for GLM-5.2:

```text
off
high
xhigh
```

`xhigh` maps to Z.AI `reasoning_effort: "max"` (the strongest Z.AI effort). Other Pi
levels (`minimal`, `low`, `medium`) are hidden via `thinkingLevelMap` and clamp up
to `high`.

> Note: Z.AI exposes three efforts natively — `high`, `max`, and disabled. The Pi
> `max` slot exists in the map for documentation but is not selectable from the
> Pi TUI because Pi's `EXTENDED_THINKING_LEVELS` stops at `xhigh`; select `xhigh`
> to get the strongest Z.AI reasoning.

Control thinking through:

- footer / model selector cycle
- `--thinking` CLI flag
- SDK `thinkingLevel`
- RPC / JSON equivalents

## Payload mapping

Upstream Pi maps levels to Z.AI request fields:

| Pi level | Z.AI request |
|----------|----------------|
| `off` | `thinking: { type: "disabled", clear_thinking: true }` |
| `minimal`/`low`/`medium` | clamp up to `high`: `reasoning_effort: "high"` |
| `high` | `thinking: { type: "enabled", clear_thinking: true }`, `reasoning_effort: "high"` |
| `xhigh` | `thinking: { type: "enabled", clear_thinking: true }`, `reasoning_effort: "max"` |

`/zai` shows the current native level read-only:

```text
Thinking: high (Pi native)
```

## `clear_thinking` (cost-first default)

Default operating mode:

```text
clear_thinking = true
preserved reasoning replay = disabled
```

This keeps request prefixes stable and improves implicit cache hit ratio. The extension enforces `clear_thinking: true` on outbound payloads when preserve mode is off and upstream would otherwise send `clear_thinking: false`.

## Preserved thinking (opt-in)

Preserved thinking replays historical reasoning and sends `clear_thinking: false` when thinking is enabled. **Disabled by default.**

Enable in project or global settings:

```json
{
  "zai": {
    "preserveThinking": true
  }
}
```

When enabled, pi-zai sets `clear_thinking: false` via the `before_provider_request` hook. Pi's native providers are not re-registered.

Trade-offs:

- better reasoning continuity across turns
- larger replayed prefixes
- lower cache hit ratio
- higher token usage

Use only when you understand the cost impact.

## Tool streaming

Platform catalog models enable `zaiToolStream: true` where supported. `/zai` reports tool streaming as `enabled` or `disabled` from model compat metadata.
