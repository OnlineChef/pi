# Security

## Credential handling

- API keys resolve through Pi's `ModelRegistry`, environment variables, `auth.json`, and `models.json` command providers.
- The extension **never prints key values** in commands, logs, or diagnostics.
- `/zai` and `/zai-doctor` show credential **source names** only (for example `ZAI_API_KEY`, `auth.json`).

## Resolution order (Pi native)

1. Runtime `--api-key`
2. `auth.json` for the active provider
3. Provider `apiKey` from `models.json` or extension registration (`$ZAI_API_KEY`)
4. Environment variable (`ZAI_API_KEY`, `ZAI_CODING_CN_API_KEY`)

The extension does not add shell commands or separate env var precedence.

## Network probes

`/zai-doctor` optional live probe calls `${baseUrl}/models` with configured auth headers. Response status is shown; response bodies and secrets are not logged.

## Prompt fingerprinting

System-prompt fingerprints:

- canonicalize whitespace and strip known volatile patterns
- never write raw prompt text to output
- expose only short hashes in `/zai` and `/zai-cache`

## Local credential files

If you store keys in `~/.config/zai/credentials.env`:

```bash
chmod 700 ~/.config/zai
chmod 600 ~/.config/zai/credentials.env
```

Never commit credential files. Rotate keys if exposed in chat, logs, or screenshots.

## Preserve thinking warning

Enabling `preserveThinking` replays historical reasoning content in API requests. This increases data sent to Z.AI and may include sensitive intermediate reasoning. Keep disabled unless required.

## Local metrics storage

pi-zai stores privacy-reduced attempt metrics locally under Pi user state:

```text
~/.pi/agent/state/pi-zai/metrics.sqlite3
~/.pi/agent/state/pi-zai/local.secret
```

- `local.secret` is a random 256-bit key used to HMAC project IDs. It is never sent remotely.
- Project IDs are `HMAC(localSecret, canonicalCwd)` — not reversible path hashes.
- `/zai-data clear-all` deletes metrics and rotates `local.secret`.
- Fingerprints (system/tool/payload) stay in local SQLite only.

Manage retention via `zai.metrics` in settings (`mode`, `retentionDays`, `maxDatabaseBytes`).

## Remote telemetry

**Not implemented in PR #1.** `zai.telemetry.mode` accepts only `"off"`.

When remote aggregate telemetry is added in a later release:

- explicit opt-in only (default off)
- anonymous daily buckets only — no prompts, code, paths, install IDs, or fingerprints
- ingest via Cloudflare Worker + Analytics Engine (not direct client access to D1/R2)

Diagnostic bundle uploads (encrypted, preview + confirm) are a separate optional later phase.
