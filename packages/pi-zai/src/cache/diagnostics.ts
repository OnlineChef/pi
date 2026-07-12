import type { SessionCacheStats } from "./metrics.ts";
import { computeCacheRatios } from "./metrics.ts";
import { formatCacheRecommendations } from "./recommendations.ts";

export type CacheDiagnosticAction = "status" | "reset-stats" | "explain";

export type CacheDiagnosticsInput = {
	stats: SessionCacheStats | undefined;
	isZaiSession: boolean;
};

function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

function formatTokens(count: number): string {
	return count.toLocaleString("en-US");
}

function formatCost(amount: number, priced: boolean): string {
	if (!priced) return "subscription-managed";
	if (amount <= 0) return "$0.00";
	return `$${amount.toFixed(4)}`;
}

function formatTimestamp(epochMs: number | undefined): string {
	if (epochMs === undefined) return "none";
	return new Date(epochMs).toISOString();
}

function segmentLines(stats: SessionCacheStats): string[] {
	const { segment, last, rolling } = stats;
	const promptTokens = rolling.input + rolling.cacheRead + rolling.cacheWrite;
	const lastRatios = last ? { hitRatio: last.hitRatio, missRatio: last.missRatio } : computeCacheRatios(rolling);

	return [
		"Current segment",
		`  Provider: ${segment.provider}`,
		`  Endpoint: ${segment.endpoint}`,
		`  Model: ${segment.model}`,
		`  Stable-prefix fingerprint: ${segment.systemFingerprint}`,
		`  Toolset fingerprint: ${segment.toolsetFingerprint}`,
		"",
		"Prompt tokens (session)",
		`  Uncached (input): ${formatTokens(rolling.input)}`,
		`  Cached (cacheRead): ${formatTokens(rolling.cacheRead)}`,
		`  Cache write: ${formatTokens(rolling.cacheWrite)}`,
		`  Total prompt: ${formatTokens(promptTokens)}`,
		`  Output: ${formatTokens(rolling.output)}`,
		"",
		"Cache ratios",
		`  Last request hit ratio: ${last ? formatPercent(last.hitRatio) : "n/a"}`,
		`  Session hit ratio: ${formatPercent(rolling.hitRatio)}`,
		`  Session miss ratio: ${formatPercent(lastRatios.missRatio)}`,
		"",
		"Cost",
		`  Estimated session cost: ${formatCost(rolling.estimatedCost, segment.endpoint === "platform")}`,
		`  Estimated cache savings: ${formatCost(rolling.estimatedSavings, segment.endpoint === "platform")}`,
		"",
		"Boundaries",
		`  Last prefix change reason: ${stats.lastPrefixChangeReason ?? "none"}`,
		`  Last compaction: ${formatTimestamp(stats.lastCompactionAt)}`,
		`  Segment started: ${formatTimestamp(stats.segmentStartedAt)}`,
		`  Requests in segment: ${rolling.requests}`,
		"",
		"Recommendations",
		...formatCacheRecommendations(stats),
	];
}

export function formatCacheDiagnostics(input: CacheDiagnosticsInput, action: CacheDiagnosticAction = "status"): string {
	if (!input.isZaiSession) {
		return "Cache diagnostics are only available for active Z.AI sessions.";
	}

	if (action === "reset-stats") {
		return "Cache metrics reset. A new segment will begin on the next Z.AI request.";
	}

	if (action === "explain") {
		return [
			"Z.AI implicit cache",
			"",
			"Z.AI reuses repeated prompt prefixes automatically. There is no manual cache breakpoint.",
			"Stable system prompts, tool definitions, and append-only history improve hit ratio.",
			"",
			"Pi native usage mapping",
			"  uncached input = usage.input",
			"  cached input = usage.cacheRead",
			"  total prompt = input + cacheRead + cacheWrite",
			"",
			"Segment boundaries reset metrics when any of these change:",
			"  provider, endpoint, model, system fingerprint, toolset fingerprint, session",
			"",
			"Cross-model rule: cache is not assumed to transfer between coding and platform endpoints,",
			"different models, different system prompts, or different toolsets.",
			"",
			"Compaction drops hidden reasoning by default while preserving visible decisions and tool outcomes.",
		].join("\n");
	}

	if (!input.stats || input.stats.rolling.requests === 0) {
		return [
			"Z.AI cache diagnostics",
			"",
			"No cache metrics recorded yet for this session.",
			"Send a Z.AI request to begin tracking.",
		].join("\n");
	}

	return ["Z.AI cache diagnostics", "", ...segmentLines(input.stats)].join("\n");
}

export function formatCacheStatus(input: CacheDiagnosticsInput): string {
	return formatCacheDiagnostics(input, "status");
}

export function formatCacheExplain(input: CacheDiagnosticsInput): string {
	return formatCacheDiagnostics(input, "explain");
}

export function formatCacheResetMessage(): string {
	return formatCacheDiagnostics({ stats: undefined, isZaiSession: true }, "reset-stats");
}
