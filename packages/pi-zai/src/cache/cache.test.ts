import { describe, expect, it } from "vitest";
import { applyZaiCompactionInstructions, applyZaiTreeSummaryInstructions } from "./compaction.ts";
import {
	analyzeSystemPromptSections,
	isVolatileSystemPromptLine,
	splitStableAndDynamicSystemPrompt,
} from "./context-policy.ts";
import { formatCacheDiagnostics } from "./diagnostics.ts";
import type { SessionCacheStats } from "./metrics.ts";
import { buildCacheSegmentKey, computeCacheRatios, detectSegmentChange } from "./metrics.ts";
import { buildCacheRecommendations } from "./recommendations.ts";

describe("metrics", () => {
	it("guards division by zero for cache ratios", () => {
		expect(computeCacheRatios({ input: 0, cacheRead: 0, cacheWrite: 0 })).toEqual({
			hitRatio: 0,
			missRatio: 0,
		});
	});

	it("computes hit and miss ratios from Pi native usage", () => {
		expect(computeCacheRatios({ input: 400, cacheRead: 800, cacheWrite: 0 })).toEqual({
			hitRatio: 2 / 3,
			missRatio: 1 / 3,
		});
	});

	it("detects segment changes across model and fingerprints", () => {
		const base = buildCacheSegmentKey({
			provider: "zai",
			baseUrl: "https://api.z.ai/api/coding/paas/v4",
			model: "glm-5.2",
			systemFingerprint: "abc",
			toolsetFingerprint: "def",
		});
		const modelChange = { ...base, model: "glm-5-turbo" };
		expect(detectSegmentChange(base, modelChange).reasons).toContain("model");

		const endpointChange = buildCacheSegmentKey({
			provider: "zai-platform",
			baseUrl: "https://api.z.ai/api/paas/v4",
			model: "glm-5.2",
			systemFingerprint: "abc",
			toolsetFingerprint: "def",
		});
		const change = detectSegmentChange(base, endpointChange);
		expect(change.changed).toBe(true);
		expect(change.reasons).toContain("endpoint");
	});
});

describe("context-policy", () => {
	it("classifies volatile lines without returning prompt content", () => {
		expect(isVolatileSystemPromptLine("Current git diff: foo")).toBe(true);
		expect(isVolatileSystemPromptLine("Follow coding standards.")).toBe(false);
	});

	it("splits stable and dynamic sections", () => {
		const prompt = "Stable rules\n\n--- dynamic context ---\nCurrent timestamp: now";
		const split = splitStableAndDynamicSystemPrompt(prompt);
		expect(split.stable).toBe("Stable rules");
		expect(split.dynamic).toContain("Current timestamp");
	});

	it("analyzes section counts only", () => {
		const analysis = analyzeSystemPromptSections("Stable\nCurrent git status: x\n\n--- dynamic context ---\nfoo");
		expect(analysis.stableLineCount).toBe(1);
		expect(analysis.volatileLineCount).toBeGreaterThan(0);
		expect(analysis.hasDynamicMarker).toBe(true);
	});
});

describe("compaction hooks", () => {
	it("applies Z.AI compaction instructions to compact events", () => {
		const event = { customInstructions: undefined as string | undefined };
		applyZaiCompactionInstructions(event);
		expect(event.customInstructions).toContain("Z.AI");
		expect(event.customInstructions).toContain("Do not preserve hidden reasoning");
	});

	it("returns replaceable tree summary instructions", () => {
		const result = applyZaiTreeSummaryInstructions();
		expect(result.replaceInstructions).toBe(true);
		expect(result.customInstructions).toContain("Stable project facts");
	});
});

describe("recommendations", () => {
	it("warns when cache hit ratio is low", () => {
		const stats: SessionCacheStats = {
			segment: {
				provider: "zai-platform",
				endpoint: "platform",
				model: "glm-5.2",
				systemFingerprint: "abcd1234",
				toolsetFingerprint: "efgh5678",
			},
			last: undefined,
			rolling: {
				input: 900,
				cacheRead: 100,
				cacheWrite: 0,
				output: 50,
				requests: 4,
				hitRatio: 0.1,
				estimatedCost: 0.02,
				estimatedSavings: 0.001,
			},
			segmentStartedAt: Date.now(),
			lastPrefixChangeReason: "model",
		};
		const tips = buildCacheRecommendations(stats);
		expect(tips.some((tip) => tip.priority === "high")).toBe(true);
		expect(tips.some((tip) => tip.message.includes("prefix change"))).toBe(true);
	});
});

describe("diagnostics", () => {
	it("formats cache status for /zai-cache", () => {
		const stats: SessionCacheStats = {
			segment: {
				provider: "zai-platform",
				endpoint: "platform",
				model: "glm-5.2",
				systemFingerprint: "abcd1234",
				toolsetFingerprint: "efgh5678",
			},
			last: {
				input: 100,
				cacheRead: 400,
				cacheWrite: 0,
				output: 50,
				reasoning: 0,
				totalTokens: 550,
				cost: 0.01,
				hitRatio: 0.8,
				missRatio: 0.2,
				estimatedSavings: 0.002,
			},
			rolling: {
				input: 100,
				cacheRead: 400,
				cacheWrite: 0,
				output: 50,
				requests: 1,
				hitRatio: 0.8,
				estimatedCost: 0.01,
				estimatedSavings: 0.002,
			},
			segmentStartedAt: Date.now(),
		};
		const output = formatCacheDiagnostics({ stats, isZaiSession: true }, "status");
		expect(output).toContain("Stable-prefix fingerprint: abcd1234");
		expect(output).toContain("Cached (cacheRead): 400");
		expect(output).toContain("Session hit ratio: 80.0%");
	});
});
