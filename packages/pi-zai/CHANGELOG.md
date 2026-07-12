# Changelog

All notable changes to `@onlinechefgroep/pi-zai` are documented in this file.

## [Unreleased]

### Added

- Z.AI compaction hooks on `session_before_compact` and `session_before_tree`
- Cache recommendations in `/zai-cache status` when hit ratio is low
- Prompt stability metrics in `/zai` (stable/volatile line counts, fingerprint)
- Footer throughput via native Pi `setStatus` (`statusTps`, last tok/s with optional session avg)
- Full throughput telemetry in `/zai` (last TPS, TTFT, session average)
- Full documentation set under `docs/`

### Changed

- README restructured with quick start and documentation index

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

[0.1.0]: https://github.com/onlinechefgroep/pi-zai/releases/tag/v0.1.0
