# Development

Contributor and maintainer workflow. End users can skip this page.

## Repository layout

```text
packages/pi-zai/
  src/           Extension source (TypeScript, strip-only)
  dist/          Build output (published to npm)
  docs/          User and operator documentation
  scripts/       Live benchmarks (cache-affinity A/B)
  test/          Vitest unit tests (*.test.ts next to modules)
```

Monorepo path: `earendil-works/pi-mono` → `packages/pi-zai`.  
Standalone mirror: [OnlineChefGroep/pi-zai](https://github.com/OnlineChefGroep/pi-zai).

## Requirements

- Node **>= 22.19.0**
- Pi packages **>= 0.80.0** (`@earendil-works/pi-coding-agent` as devDependency for tests)

## Build and test

```bash
cd packages/pi-zai
npm run clean && npm run build
npm test
```

From monorepo root after code changes:

```bash
npm run check
```

Integration regression (coding-agent harness):

```bash
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/suite/regressions/pi-zai-extension-integration.test.ts
```

## Local install in Pi

```bash
cd packages/pi-zai
npm run build
pi install file:/absolute/path/to/packages/pi-zai
/reload
```

Project settings example (`.pi/settings.json`):

```json
{
  "zai": {
    "metrics": { "mode": "local" },
    "telemetry": { "mode": "off" }
  }
}
```

`telemetry.mode` in settings is ignored — always off until PR #4.

## Live cache-affinity benchmark

Requires a real `ZAI_API_KEY` and network:

```bash
cd packages/pi-zai
export ZAI_API_KEY='...'
npm run benchmark:cache-affinity
```

Optional JSON output: `PI_ZAI_AB_OUTPUT=/tmp/ab.json`.

This is separate from `/zai-benchmark` (manifest A0–A3, local SQLite run tracking).

## Boundary tests

Source-level guards in `src/boundary.test.ts`:

- No remote telemetry upload URLs in extension code
- `telemetryMode` forced off in config loader
- Privacy preview does not call `fetch`

## Release (maintainers)

Lockstep with monorepo release script or standalone npm publish from `packages/pi-zai`:

```bash
npm run clean && npm run build && npm test
npm pack --dry-run
```

Changelog: `packages/pi-zai/CHANGELOG.md`. Breaking changes → minor bump (0.2.0+).

**Remote telemetry is not a release blocker** until PR #4 is implemented and documented.

## Sync standalone repo

After monorepo changes, mirror to `OnlineChefGroep/pi-zai`:

1. `npm run clean && npm run build`
2. Rsync `src/`, `docs/`, `dist/`, `scripts/`
3. Copy `package.json`, `CHANGELOG.md`, `README.md`, tsconfig files
4. Commit and push `main`

Do not publish stale `dist/` artifacts — always `npm run clean && npm run build` first.
