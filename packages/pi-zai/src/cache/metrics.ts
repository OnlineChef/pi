import type { Usage } from "@earendil-works/pi-ai";
import { calculateCost, type Model } from "@earendil-works/pi-ai/compat";
import { endpointsShareCache, isCodingPlanProvider, isPlatformProvider } from "./context-policy.ts";

export type CacheSegmentKey = {
	provider: string;
	endpoint: string;
	model: string;
	systemFingerprint: string;
	toolsetFingerprint: string;
};

export type SegmentChange = {
	changed: boolean;
	reasons: string[];
};

export type CacheUsageSnapshot = {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	reasoning: number;
	totalTokens: number;
	cost: number;
	hitRatio: number;
	missRatio: number;
	estimatedSavings: number;
};

export type SessionCacheStats = {
	segment: CacheSegmentKey;
	last: CacheUsageSnapshot | undefined;
	rolling: {
		input: number;
		cacheRead: number;
		cacheWrite: number;
		output: number;
		requests: number;
		hitRatio: number;
		estimatedCost: number;
		estimatedSavings: number;
	};
	lastPrefixChangeReason?: string;
	lastCompactionAt?: number;
	segmentStartedAt: number;
};

export function endpointLabel(provider: string, baseUrl: string): string {
	if (isPlatformProvider(provider)) return "platform";
	if (isCodingPlanProvider(provider) || baseUrl.includes("/coding/")) return "coding";
	return baseUrl;
}

export function buildCacheSegmentKey(input: {
	provider: string;
	baseUrl: string;
	model: string;
	systemFingerprint: string;
	toolsetFingerprint: string;
}): CacheSegmentKey {
	return {
		provider: input.provider,
		endpoint: endpointLabel(input.provider, input.baseUrl),
		model: input.model,
		systemFingerprint: input.systemFingerprint,
		toolsetFingerprint: input.toolsetFingerprint,
	};
}

export function detectSegmentChange(previous: CacheSegmentKey | undefined, next: CacheSegmentKey): SegmentChange {
	if (!previous) {
		return { changed: true, reasons: ["session"] };
	}

	const reasons: string[] = [];
	if (previous.provider !== next.provider) reasons.push("provider");
	if (previous.endpoint !== next.endpoint) reasons.push("endpoint");
	if (previous.model !== next.model) reasons.push("model");
	if (previous.systemFingerprint !== next.systemFingerprint) reasons.push("system-fingerprint");
	if (previous.toolsetFingerprint !== next.toolsetFingerprint) reasons.push("toolset-fingerprint");

	if (reasons.includes("endpoint") && !endpointsShareCache(previous.endpoint, next.endpoint)) {
		// Cross-model / cross-endpoint: never assume cache transfer.
		if (!reasons.includes("model")) {
			reasons.push("cross-endpoint-no-transfer");
		}
	}

	return { changed: reasons.length > 0, reasons };
}

export function formatSegmentChangeReason(change: SegmentChange): string {
	if (!change.changed) return "unchanged";
	return change.reasons.join(", ");
}

export function computeCacheRatios(usage: Pick<Usage, "input" | "cacheRead" | "cacheWrite">): {
	hitRatio: number;
	missRatio: number;
} {
	const totalPrompt = usage.input + usage.cacheRead + usage.cacheWrite;
	if (totalPrompt <= 0) {
		return { hitRatio: 0, missRatio: 0 };
	}
	return {
		hitRatio: usage.cacheRead / totalPrompt,
		missRatio: usage.input / totalPrompt,
	};
}

export function estimateUsageCost(model: Model<any>, usage: Usage): number {
	const copy = {
		...usage,
		cost: { ...usage.cost },
	};
	calculateCost(model, copy);
	return copy.cost.total;
}

export function estimateCacheSavings(model: Model<any>, usage: Usage): number {
	if (usage.cacheRead <= 0) return 0;
	const uncached = {
		...usage,
		input: usage.input + usage.cacheRead,
		cacheRead: 0,
		cacheWrite: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	const cached = { ...usage, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	calculateCost(model, uncached);
	calculateCost(model, cached);
	return Math.max(0, uncached.cost.total - cached.cost.total);
}

export function createUsageSnapshot(model: Model<any>, usage: Usage): CacheUsageSnapshot {
	const ratios = computeCacheRatios(usage);
	return {
		input: usage.input,
		cacheRead: usage.cacheRead,
		cacheWrite: usage.cacheWrite,
		output: usage.output,
		reasoning: usage.reasoning ?? 0,
		totalTokens: usage.totalTokens,
		cost: estimateUsageCost(model, usage),
		hitRatio: ratios.hitRatio,
		missRatio: ratios.missRatio,
		estimatedSavings: estimateCacheSavings(model, usage),
	};
}

export class CacheMetricsStore {
	private stats: SessionCacheStats | undefined;

	reset(segment: CacheSegmentKey, reason?: string): SessionCacheStats {
		this.stats = {
			segment,
			last: undefined,
			rolling: {
				input: 0,
				cacheRead: 0,
				cacheWrite: 0,
				output: 0,
				requests: 0,
				hitRatio: 0,
				estimatedCost: 0,
				estimatedSavings: 0,
			},
			lastPrefixChangeReason: reason,
			segmentStartedAt: Date.now(),
		};
		return this.stats;
	}

	get(): SessionCacheStats | undefined {
		return this.stats;
	}

	clear(): void {
		this.stats = undefined;
	}

	record(model: Model<any>, usage: Usage): SessionCacheStats | undefined {
		if (!this.stats) return undefined;
		const snapshot = createUsageSnapshot(model, usage);
		this.stats.last = snapshot;
		const rolling = this.stats.rolling;
		rolling.input += usage.input;
		rolling.cacheRead += usage.cacheRead;
		rolling.cacheWrite += usage.cacheWrite;
		rolling.output += usage.output;
		rolling.requests += 1;
		rolling.estimatedCost += snapshot.cost;
		rolling.estimatedSavings += snapshot.estimatedSavings;
		const ratios = computeCacheRatios({
			input: rolling.input,
			cacheRead: rolling.cacheRead,
			cacheWrite: rolling.cacheWrite,
		});
		rolling.hitRatio = ratios.hitRatio;
		return this.stats;
	}

	markCompaction(): void {
		if (!this.stats) return;
		this.stats.lastCompactionAt = Date.now();
	}

	updateSegment(segment: CacheSegmentKey, reason: string): SessionCacheStats {
		const change = detectSegmentChange(this.stats?.segment, segment);
		if (!this.stats || change.changed) {
			return this.reset(segment, reason);
		}
		return this.stats;
	}
}
