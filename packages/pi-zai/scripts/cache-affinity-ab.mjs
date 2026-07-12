#!/usr/bin/env node
/**
 * Live A/B benchmark: X-Session-Id cache affinity on Z.AI Coding Plan.
 *
 * Usage (from packages/pi-zai after build):
 *   npm run benchmark:cache-affinity
 *
 * Env:
 *   ZAI_API_KEY / ZAI_CODING_API_KEY  (required)
 *   PI_ZAI_AB_TRIALS=5                trials per mode (default 5)
 *   PI_ZAI_AB_TURNS=6                 turns per trial (default 6)
 *   PI_ZAI_AB_MODEL=glm-4.6           model id
 *   PI_ZAI_AB_PREFIX_LINES=400        stable prefix size
 *   PI_ZAI_AB_OUTPUT=.firecrawl/...   optional JSON report path
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	formatReport,
	loadBenchmarkConfigFromEnv,
	runCacheAffinityBenchmark,
} from "../dist/benchmark/cache-affinity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
	const loaded = loadBenchmarkConfigFromEnv();
	if ("error" in loaded) {
		console.error(loaded.error);
		process.exit(1);
	}

	console.log("Running cache-affinity benchmark (stable vs none vs rotating)...");
	console.log(
		`  model=${loaded.model} trials=${loaded.trials} turns=${loaded.turns} prefixLines=${loaded.prefixLines}`,
	);
	const report = await runCacheAffinityBenchmark(loaded);
	const text = formatReport(report);
	console.log("\n" + text);

	const outPath = process.env.PI_ZAI_AB_OUTPUT;
	if (outPath) {
		const abs = resolve(outPath);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, JSON.stringify(report, null, 2), "utf-8");
		console.log(`\nWrote JSON report to ${abs}`);
	}

	process.exit(report.winner === "inconclusive" ? 2 : 0);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
