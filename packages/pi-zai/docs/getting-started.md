# Getting started

## Requirements

- Pi (`@earendil-works/pi-coding-agent`) **>= 0.80.0**
- Built-in Z.AI providers (`zai`, `zai-coding-cn`) from upstream Pi
- Node **>= 22.19.0** (package engine)

## Install

```bash
pi install npm:@onlinechefgroep/pi-zai
/reload
```

Contributors: see [Development](development.md) for monorepo install and testing.

## Credentials

| Use | Environment variable | Provider |
|-----|---------------------|----------|
| Z.AI (global) | `ZAI_API_KEY` | `zai`, `zai-platform` |
| Coding Plan (CN) | `ZAI_CODING_CN_API_KEY` | `zai-coding-cn` |

Configure keys through Pi itself: `/login`, `~/.pi/agent/auth.json`, `models.json`, or env vars. The extension does not add a separate credential resolver.

Recommended layout:

```bash
# ~/.config/zai/credentials.env (chmod 600) — optional shell convenience
export ZAI_API_KEY='...'
```

Source from your shell profile, or store the key in Pi via `/login` or `auth.json`. Never commit key values.

Pi also resolves credentials from `auth.json` and `models.json` command providers. The extension reports **source names only**, never secret values.

## First session

1. Select a Z.AI model (`zai/glm-5.2` or `zai-platform/glm-5.2`).
2. Run `/zai-doctor` for offline checks and optional network probe.
3. Send a prompt.
4. Run `/zai-cache status` to inspect cache metrics.

## Choosing an endpoint

| Choose | When |
|--------|------|
| Coding Plan (`zai`) | You have a Z.AI DevPack / Coding Plan subscription |
| Platform (`zai-platform`) | You want metered billing with per-model cost metadata |

Switch at any time:

```text
/zai-endpoint coding
/zai-endpoint platform
```

The active endpoint always follows the selected model's provider. There is no hidden endpoint state.

## Privacy check (recommended)

```text
/zai-privacy preview
/zai-data status
```

Read [Architecture](architecture.md) for how local metrics relate to Z.AI API traffic and why remote telemetry is off.

## Next steps

- [Architecture](architecture.md) — how pi-zai fits Pi and what is stored where
- [Security](security.md) — allowlists and wipe commands
- [Cache optimization](cache-optimization.md) — improve hit ratio and lower cost
- [Thinking](thinking.md) — native levels and preserve opt-in
- [Commands](commands.md) — full slash command reference
