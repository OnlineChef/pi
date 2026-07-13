# Development

Contributor and maintainer workflow. End users can skip this page.

## Repository layout

```text
packages/pi-zai/
  src/           Extension source (TypeScript, strip-only)
  dist/          Build output (published to npm)
  docs/          User and operator documentation
  worker/        Cloudflare Worker ingest (telemetry)
  scripts/       Live benchmarks (cache-affinity A/B)
  test/          Vitest unit tests (*.test.ts next to modules)
```

Monorepo path: `earendil-works/pi-mono` → `packages/pi-zai`.  
Standalone mirror (source of truth for releases): [OnlineChefGroep/pi-zai](https://github.com/OnlineChefGroep/pi-zai).

The monorepo copy is kept for Pi integration tests (`packages/coding-agent/test/suite/regressions/`). Ship user-facing changes to the standalone repo; do not rely on pushing the monorepo fork for releases.

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

Opt-in remote telemetry: set `"telemetry": { "mode": "aggregate" }`, `/reload`, then `/zai-telemetry enable`.

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

- Remote `fetch` isolated to `telemetry/uploader.ts`
- Privacy preview does not call `fetch`
- `zai-telemetry` command and aggregate mode in config

## Telemetry worker deploy

```bash
cd packages/pi-zai/worker/telemetry
npm install
npm run check
npx wrangler deploy
```

Bind route `api.chefgroep.online/pi-zai/telemetry/v1/aggregate` to the deployed worker. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Release (maintainers)

Lockstep with monorepo release script or standalone npm publish from `packages/pi-zai`:

```bash
npm run clean && npm run build && npm test
npm pack --dry-run
```

Changelog: `packages/pi-zai/CHANGELOG.md`. Breaking changes → minor bump (0.2.0+).

## Sync standalone repo

After monorepo changes, mirror to `OnlineChefGroep/pi-zai`:

1. `npm run clean && npm run build`
2. Rsync `src/`, `docs/`, `dist/`, `scripts/`
3. Copy `package.json`, `CHANGELOG.md`, `README.md`, tsconfig files
4. Commit and push `main`

Do not publish stale `dist/` artifacts — always `npm run clean && npm run build` first.
