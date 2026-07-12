# Cache optimization

Z.AI uses **implicit context caching**: repeated prompt prefixes are recognized automatically. There are no manual cache breakpoints, `cache_control` markers, or `prompt_cache_key` fields for Z.AI.

Official reference: [Z.AI Context Caching](https://docs.z.ai/guides/capabilities/cache.md)

## How Pi maps usage

| Pi field | Z.AI meaning |
|----------|----------------|
| `usage.input` | Uncached prompt tokens |
| `usage.cacheRead` | Cached prompt tokens (`prompt_tokens_details.cached_tokens`) |
| `usage.cacheWrite` | Cache write tokens (when reported) |

Hit ratio:

```text
cacheRead / (input + cacheRead + cacheWrite)
```

Miss ratio:

```text
input / (input + cacheRead + cacheWrite)
```

## What this extension tracks

Each Z.AI request updates a **cache segment** keyed by:

- provider
- endpoint (coding / platform / coding-cn)
- model id
- stable system-prompt fingerprint
- toolset fingerprint

Metrics reset when any key changes. Cross-endpoint cache transfer is **not** assumed.

Fingerprints canonicalize content without logging raw prompts:

- strip volatile lines (git status, timestamps, token counts)
- ignore content below the dynamic-context marker
- hash tool definitions in stable sorted order

## Cost-first defaults

Default mode optimizes cache prefix stability:

```text
clear_thinking = true
preserved reasoning replay = disabled
```

Historical `reasoning_content` is not replayed unless you opt in via `zai.preserveThinking`. See [Thinking](thinking.md).

## System prompt layout

Put durable instructions in a **stable prefix**. Put volatile runtime context after the marker:

```text
You are a coding agent. Follow project conventions.

--- dynamic context ---
Current git status: ...
Current timestamp: ...
```

Volatile line prefixes recognized by the extension:

- `Current git status`
- `Current git diff`
- `Latest test failure`
- `Current timestamp`
- `Ephemeral diagnostics`
- `Context tokens:`
- `Token count:`

`/zai` reports stable vs volatile line counts and the current fingerprint.

## Compaction

On compaction and branch summarization for Z.AI sessions, the extension injects deterministic instructions:

- preserve visible decisions, paths, and tool outcomes
- drop hidden reasoning blocks
- use fixed section headings for stable summaries

This keeps post-compaction prefixes more predictable and cache-friendly.

## Recommendations

`/zai-cache status` includes actionable recommendations when:

- hit ratio is low or moderate
- a recent prefix change reset the segment
- cache writes exceed reads

Reset telemetry only:

```text
/zai-cache reset-stats
```

This does **not** invalidate Z.AI server-side caches.

## Best practices

1. **Stable system prompt** — edit rules rarely; append dynamic context below the marker.
2. **Stable toolset** — avoid adding/removing tools mid-session when possible.
3. **One endpoint per workflow** — do not expect cache to transfer between Coding Plan and Platform.
4. **Append history** — multi-turn conversations cache prior messages when prefixes match.
5. **Monitor** — use `/zai-cache status` after several turns; aim for rising `cacheRead`.

## Platform billing note

On `zai-platform`, cached tokens use discounted pricing from model metadata (`cost.cacheRead`). `/zai-usage` and `/zai-cache` show estimated dollar savings on Platform; Coding Plan shows `subscription-managed`.
