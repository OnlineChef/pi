# Changelog

All notable changes to `@onlinechefgroep/pi-zai` are documented in this file.

## [Unreleased]

### Breaking Changes

### Added

### Changed

### Fixed

### Removed

## [0.3.0] - 2026-07-12

### Added

- Opt-in anonymous daily aggregate telemetry (`zai.telemetry.mode: aggregate`)
- `/zai-telemetry` command: `status`, `preview`, `enable`, `disable`, `upload`, `sync`
- Telemetry consent file at `~/.pi/agent/state/pi-zai/telemetry.consent.json`
- Client uploader with forbidden-field validation before POST
- Anonymous daily rollup helpers and `telemetry_uploads` tracking in SQLite
- Cloudflare Worker ingest scaffold (`worker/telemetry/`) → Analytics Engine `pi_zai_telemetry`

### Changed

- `zai.telemetry.mode` and optional `telemetry.ingestUrl` now read from settings (default `off`)
- `/zai-privacy preview` shows upload readiness when mode + consent are active
- Completed UTC days upload on session start or `/zai-telemetry sync`

## [0.2.0] - 2026-07-12

### Breaking Changes

- pi-zai no longer registers or unregisters Pi's native `zai` / `zai-coding-cn` providers
- `zai-platform` is not auto-registered; add via `models.json` manually
- Removed `PI_ZAI_*` environment overrides; use `settings.json` only

### Added

- Local SQLite metrics storage with memory fail-open fallback (`src/storage/`)
- HMAC project IDs keyed by local `local.secret` (never sent remotely)
- Request/query correlation and privacy-reduced attempt records
- `/zai-data` command for storage status, wipe, export, and vacuum
- Metrics config in `settings.json` (`zai.metrics.mode`, retention, size limits)
- PR #1 boundary tests: no remote telemetry endpoints or upload paths
- Native Pi provider boundary (PR #2): thinking normalization via `before_provider_request` only
- `isNativeZaiModel`, `normalizeZaiThinkingPayload` exports for tests and integrators
- Benchmark manifest A0-A3 with `/zai-benchmark` (PR #3)
- `/zai-privacy preview` local allowlist and future aggregate preview (not sent)
- `/zai-transport` local latency and error-category summary
- Safe prompt normalization when `zai.promptStability.mode: "safe"` and dynamic marker present
- Benchmark run tracking: `/zai-benchmark start|complete|status|report|gates` with SQLite `benchmark_runs`
- Benchmark turns measured from `attemptsBaseline` at run start; gates use per-scenario turn targets
- [Architecture](docs/architecture.md): stack role, request lifecycle, telemetry readiness table
- [Development](docs/development.md): build, test, benchmark, standalone sync
- Expanded [Security](docs/security.md) and marketing [README](README.md)

### Changed

- `X-Session-Id` cache affinity requires `zai.sessionAffinity: "experimental"` (default off)
- `/zai-data clear-all` also rotates the local project secret
- `/zai-doctor` treats Platform provider as optional; cache affinity reflects settings
- Attempt timing starts at `before_agent_start`; transport summary includes rolled-up attempts
- `/zai-data`, `/zai-transport`, `/zai-privacy` resolve project hash via cwd fallback

### Fixed

- Missing local attempt records when provider hooks skip `onPayload` (faux/tests)
- Transport summary ignored daily rollups after cleanup
- Privacy preview bucket upper-boundary off-by-one
- SQLite size enforcement now rolls up detail rows before deletion

### Removed

## [0.1.1] - 2026-07-12

### Added

- Z.AI compaction hooks on `session_before_compact` and `session_before_tree`
- Cache recommendations in `/zai-cache status` when hit ratio is low
- Prompt stability metrics in `/zai` (stable/volatile line counts, fingerprint)
- Footer throughput via native Pi `setStatus` (`statusTps`, last tok/s with optional session avg)
- Full throughput telemetry in `/zai` (last TPS, TTFT, session average)
- Full documentation set under `docs/`
- Coding Plan quota via monitor API in `/zai-usage` (5h / weekly / MCP windows)
- `X-Session-Id` cache-affinity and `User-Agent` headers on Z.AI provider requests
- Connection stability probe and Pi retry settings check in `/zai-doctor`
- Actionable connection-error hints on `agent_settled` after retries exhaust
- Live cache-affinity A/B benchmark (`npm run benchmark:cache-affinity`)
- Documented live cache-affinity benchmark snapshot
- Pi harness suite test for extension command registration, headers, and cache metrics

### Changed

- README restructured with quick start and documentation index
- `/zai` and `/zai-usage` show extension version; clamp invalid thinking levels for GLM-5.2
- Quota fetch retries auth schemes and transient network errors

### Fixed

- TPS uses wall-clock duration (fixes bogus 757000 tok/s)
- Prompt stability resolves live from system prompt when hook snapshot missing

## [0.1.0] - 2026-07-12

### Added

- Pi extension package scaffold with Z.AI Platform API provider registration
- Implicit cache optimization layer (fingerprints, metrics, compaction policy, diagnostics)
- Slash commands: `/zai`, `/zai-endpoint`, `/zai-cache`, `/zai-usage`, `/zai-doctor`
- Cost-first defaults aligned with upstream Pi (`clear_thinking=true`, preserved thinking off)
- Native Pi thinking integration for GLM-5.2 (`off` / `high` / `max` only)
- README with install, security, cache, and endpoint documentation

### Security

- Credential source names only in diagnostics output; API key values never printed

[0.2.0]: https://github.com/onlinechefgroep/pi-zai/releases/tag/v0.2.0
[0.1.1]: https://github.com/onlinechefgroep/pi-zai/releases/tag/v0.1.1
[0.1.0]: https://github.com/onlinechefgroep/pi-zai/releases/tag/v0.1.0
