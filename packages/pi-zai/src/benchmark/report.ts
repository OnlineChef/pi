import type { SessionCacheStats } from "../cache/metrics.ts";
import type { TransportSummary, UsageSummary } from "../storage/types.ts";
import {
	BENCHMARK_SAMPLE_GATES,
	type BenchmarkScenarioId,
	type BenchmarkVariantId,
	findBenchmarkScenario,
} from "./manifest.ts";
import type { BenchmarkGateCheck, BenchmarkRunManifest, BenchmarkRunRecord, BenchmarkRunReport } from "./types.ts";

export type BenchmarkReportInput = {
	manifest: BenchmarkRunManifest;
	completedAt: number;
	usage: UsageSummary;
	transport: TransportSummary;
	cache: SessionCacheStats | undefined;
	completedRunsForVariant: number;
	turnsObserved?: number;
};

export function buildBenchmarkRunReport(input: BenchmarkReportInput): BenchmarkRunReport {
	const rolling = input.cache?.rolling;
	const cacheHitRatio =
		rolling && rolling.input + rolling.cacheRead + rolling.cacheWrite > 0
			? rolling.cacheRead / (rolling.input + rolling.cacheRead + rolling.cacheWrite)
			: input.usage.cacheHitRatio;
	const turnsObserved = input.turnsObserved ?? input.usage.attempts;

	return {
		schema: 1,
		completedAt: input.completedAt,
		durationMs: Math.max(0, input.completedAt - input.manifest.createdAt),
		turnsObserved,
		usage: input.usage,
		transport: input.transport,
		cache: {
			requestsInSegment: rolling?.requests ?? 0,
			cacheHitRatio,
			segmentChanges: input.cache?.lastPrefixChangeReason ? 1 : 0,
		},
		gates: evaluateRunGates(
			input.manifest.variant,
			input.manifest.scenario,
			turnsObserved,
			input.completedRunsForVariant,
		),
	};
}

export function evaluateRunGates(
	variant: BenchmarkVariantId,
	scenario: BenchmarkScenarioId,
	turnsObserved: number,
	completedRunsForVariant: number,
): BenchmarkGateCheck[] {
	const requiredTurns = findBenchmarkScenario(scenario)?.turns ?? BENCHMARK_SAMPLE_GATES.turnsPerSession;
	return [
		{
			id: "turns-per-session",
			label: "Turns in this session",
			required: requiredTurns,
			actual: turnsObserved,
			passed: turnsObserved >= requiredTurns,
		},
		{
			id: "sessions-per-variant",
			label: `Completed runs for ${variant}`,
			required: BENCHMARK_SAMPLE_GATES.sessionsPerVariantScenario,
			actual: completedRunsForVariant,
			passed: completedRunsForVariant >= BENCHMARK_SAMPLE_GATES.sessionsPerVariantScenario,
		},
	];
}

export function formatBenchmarkRunReport(record: BenchmarkRunRecord): string {
	if (!record.report) {
		return `Benchmark run ${record.runId} (${record.variant}/${record.scenario}) is still in progress.`;
	}

	const report = record.report;
	const gateLines = report.gates.map((gate) => {
		const status = gate.passed ? "pass" : "fail";
		return `  ${gate.label}: ${gate.actual}/${gate.required} (${status})`;
	});

	return [
		`Benchmark report: ${record.variant} / ${record.scenario}`,
		`  Run id: ${record.runId}`,
		`  Duration: ${Math.round(report.durationMs / 1000)}s`,
		`  Turns observed: ${report.turnsObserved}`,
		`  Cache hit ratio: ${(report.cache.cacheHitRatio * 100).toFixed(1)}%`,
		`  Transport errors: ${report.transport.errors}`,
		`  Sample gates:`,
		...gateLines,
	].join("\n");
}

export function formatBenchmarkGatesSummary(
	runs: readonly { variant: BenchmarkVariantId; scenario: BenchmarkScenarioId; report?: BenchmarkRunReport }[],
): string {
	const completed = runs.filter((run) => run.report !== undefined);
	if (completed.length === 0) {
		return "No completed benchmark runs yet. Use /zai-benchmark start then complete after your scenario.";
	}

	const byVariant = new Map<BenchmarkVariantId, number>();
	for (const run of completed) {
		byVariant.set(run.variant, (byVariant.get(run.variant) ?? 0) + 1);
	}

	const lines = [
		"pi-zai benchmark gate summary",
		"",
		"Completed runs by variant:",
		...Array.from(byVariant.entries()).map(([variant, count]) => `  ${variant}: ${count}`),
		"",
		"Targets:",
		`  ${BENCHMARK_SAMPLE_GATES.sessionsPerVariantScenario} sessions per variant/scenario`,
		`  ${BENCHMARK_SAMPLE_GATES.minTotalTurnsA0A3}+ total turns across A0-A3 before default changes`,
		`  ${Math.round(BENCHMARK_SAMPLE_GATES.medianGapForAffinity * 100)}pp median cache-hit gap for affinity winner`,
	];

	const affinityRuns = completed.filter((run) => run.variant === "A3");
	const baselineRuns = completed.filter((run) => run.variant === "A1");
	if (affinityRuns.length > 0 && baselineRuns.length > 0) {
		const median = (values: number[]): number => {
			if (values.length === 0) return 0;
			const sorted = [...values].sort((left, right) => left - right);
			return sorted[Math.floor(sorted.length / 2)] ?? 0;
		};
		const a3Median = median(affinityRuns.map((run) => run.report!.cache.cacheHitRatio));
		const a1Median = median(baselineRuns.map((run) => run.report!.cache.cacheHitRatio));
		const gapPp = Math.round((a3Median - a1Median) * 100);
		lines.push(
			"",
			`A3 vs A1 median cache-hit gap: ${gapPp}pp (need ${Math.round(BENCHMARK_SAMPLE_GATES.medianGapForAffinity * 100)}pp)`,
		);
	}

	return lines.join("\n");
}
