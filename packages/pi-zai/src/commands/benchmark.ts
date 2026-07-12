import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	BENCHMARK_SCENARIOS,
	BENCHMARK_VARIANTS,
	type BenchmarkVariantId,
	findBenchmarkScenario,
	findBenchmarkVariant,
	formatBenchmarkInstructions,
	formatBenchmarkManifest,
} from "../benchmark/manifest.ts";
import { buildBenchmarkRunReport, formatBenchmarkGatesSummary, formatBenchmarkRunReport } from "../benchmark/report.ts";
import type { BenchmarkRunManifest } from "../benchmark/types.ts";
import { getCacheMetricsStore, getMetricsStorage, sessionState } from "../state.ts";
import { projectIdForCwd } from "../storage/project-id.ts";
import type { ZaiCommandDeps } from "./deps.ts";

const ACTIONS = ["manifest", "instructions", "start", "complete", "status", "report", "gates"] as const;

function createBenchmarkRunId(): string {
	return `bench-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function completedRunsForVariant(variant: BenchmarkVariantId): number {
	const storage = getMetricsStorage();
	if (!storage) return 0;
	return storage.listBenchmarkRuns().filter((run) => run.variant === variant && run.report !== undefined).length;
}

export function registerZaiBenchmarkCommand(pi: ExtensionAPI, deps: ZaiCommandDeps): void {
	pi.registerCommand("zai-benchmark", {
		description: "A0-A3 benchmark manifest, run tracking, and gate summary",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase();
			const actionMatches = ACTIONS.filter((value) => value.startsWith(normalized));
			if (actionMatches.length > 0) {
				return actionMatches.map((value) => ({ value, label: value }));
			}
			const variantMatches = BENCHMARK_VARIANTS.map((variant) => variant.id).filter((value) =>
				value.toLowerCase().startsWith(normalized),
			);
			if (variantMatches.length > 0) {
				return variantMatches.map((value) => ({ value, label: value }));
			}
			const scenarioMatches = BENCHMARK_SCENARIOS.map((scenario) => scenario.id).filter((value) =>
				value.startsWith(normalized),
			);
			return scenarioMatches.length > 0 ? scenarioMatches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const tokens = args
				.trim()
				.split(/\s+/)
				.filter((token) => token.length > 0);
			const action = tokens[0]?.toLowerCase() ?? "manifest";
			const storage = getMetricsStorage();

			switch (action) {
				case "manifest":
					ctx.ui.notify(formatBenchmarkManifest(), "info");
					return;
				case "instructions": {
					const variantId = tokens[1];
					if (!variantId) {
						ctx.ui.notify("Usage: /zai-benchmark instructions <A0|A1|A2|A3> [scenario]", "warning");
						return;
					}
					ctx.ui.notify(formatBenchmarkInstructions(variantId, tokens[2]), "info");
					return;
				}
				case "start": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const variantId = tokens[1];
					const scenarioId = tokens[2];
					const variant = variantId ? findBenchmarkVariant(variantId) : undefined;
					const scenario = scenarioId ? findBenchmarkScenario(scenarioId) : BENCHMARK_SCENARIOS[0];
					if (!variant || variant.id === "A0") {
						ctx.ui.notify(
							"Usage: /zai-benchmark start <A1|A2|A3> [scenario]. A0 runs without pi-zai.",
							"warning",
						);
						return;
					}
					if (!scenario) {
						ctx.ui.notify(`Unknown scenario "${scenarioId}".`, "warning");
						return;
					}
					if (sessionState.activeBenchmarkRunId) {
						ctx.ui.notify(
							`Benchmark run ${sessionState.activeBenchmarkRunId} is already active. Use /zai-benchmark complete first.`,
							"warning",
						);
						return;
					}

					const createdAt = Date.now();
					const projectId = sessionState.projectId ?? projectIdForCwd(ctx.cwd);
					const manifest: BenchmarkRunManifest = {
						schema: 1,
						runId: createBenchmarkRunId(),
						createdAt,
						variant: variant.id,
						scenario: scenario.id,
						extensionVersion: deps.extensionVersion,
						projectId,
						attemptsBaseline: storage.getUsageSummary({ projectId }).attempts,
						sessionHash: sessionState.sessionHash,
						provider: sessionState.provider,
						modelId: sessionState.modelId,
						settings: variant.settings,
					};
					storage.startBenchmarkRun(manifest);
					sessionState.activeBenchmarkRunId = manifest.runId;
					ctx.ui.notify(
						[
							`Started benchmark ${manifest.runId}`,
							`  Variant: ${variant.id} (${variant.label})`,
							`  Scenario: ${scenario.id} (${scenario.turns} turns)`,
							`  Run ${scenario.turns} turns, then /zai-benchmark complete`,
						].join("\n"),
						"info",
					);
					return;
				}
				case "complete": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const runId = tokens[1] ?? sessionState.activeBenchmarkRunId;
					if (!runId) {
						ctx.ui.notify("No active benchmark run. Use /zai-benchmark start <A1|A2|A3> [scenario].", "warning");
						return;
					}
					const run = storage.getBenchmarkRun(runId);
					if (!run) {
						ctx.ui.notify(`Unknown benchmark run "${runId}".`, "warning");
						return;
					}
					if (run.report) {
						ctx.ui.notify(`Benchmark run ${runId} is already completed.`, "warning");
						return;
					}

					const projectId = run.manifest.projectId;
					const filter = { projectId, since: run.manifest.createdAt };
					const completedAt = Date.now();
					const projectSummary = storage.getUsageSummary({ projectId });
					const report = buildBenchmarkRunReport({
						manifest: run.manifest,
						completedAt,
						usage: storage.getUsageSummary(filter),
						transport: storage.getTransportSummary(filter),
						cache: getCacheMetricsStore().get(),
						completedRunsForVariant: completedRunsForVariant(run.variant) + 1,
						turnsObserved: projectSummary.attempts - run.manifest.attemptsBaseline,
					});
					storage.completeBenchmarkRun(runId, report);
					if (sessionState.activeBenchmarkRunId === runId) {
						sessionState.activeBenchmarkRunId = undefined;
					}
					ctx.ui.notify(formatBenchmarkRunReport({ ...run, report }), "info");
					return;
				}
				case "status": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const runs = storage.listBenchmarkRuns().slice(0, 5);
					const lines = [
						"pi-zai benchmark status",
						`  Active run: ${sessionState.activeBenchmarkRunId ?? "none"}`,
						`  Stored runs: ${storage.getStatus().benchmarkRows}`,
					];
					for (const run of runs) {
						const state = run.report ? "completed" : "in-progress";
						lines.push(`  ${run.runId}  ${run.variant}/${run.scenario}  (${state})`);
					}
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}
				case "report": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const runId = tokens[1] ?? sessionState.activeBenchmarkRunId;
					if (!runId) {
						ctx.ui.notify("Usage: /zai-benchmark report <run-id>", "warning");
						return;
					}
					const run = storage.getBenchmarkRun(runId);
					if (!run) {
						ctx.ui.notify(`Unknown benchmark run "${runId}".`, "warning");
						return;
					}
					ctx.ui.notify(formatBenchmarkRunReport(run), "info");
					return;
				}
				case "gates":
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					ctx.ui.notify(formatBenchmarkGatesSummary(storage.listBenchmarkRuns()), "info");
					return;
				default:
					ctx.ui.notify(`Unknown action "${action}". Try: ${ACTIONS.join(", ")}`, "warning");
			}
		},
	});
}
