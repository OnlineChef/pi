import { describe, expect, it } from "vitest";
import {
	buildReport,
	buildStablePrefix,
	formatPercent,
	pickWinner,
	sessionHeaderForMode,
	summarizeMode,
	type TrialResult,
	warmCacheHitRatio,
} from "./cache-affinity.ts";

describe("sessionHeaderForMode", () => {
	it("stable returns fixed id", () => {
		expect(sessionHeaderForMode("stable", "abc", 2)).toBe("abc");
	});

	it("none returns undefined", () => {
		expect(sessionHeaderForMode("none", "abc", 2)).toBeUndefined();
	});

	it("rotating changes per turn", () => {
		const a = sessionHeaderForMode("rotating", "abc", 1);
		const b = sessionHeaderForMode("rotating", "abc", 2);
		expect(a).toContain("abc");
		expect(b).toContain("abc");
		expect(a).not.toBe(b);
	});
});

describe("warmCacheHitRatio", () => {
	it("ignores cold first turn", () => {
		const turns = [
			{ turn: 0, promptTokens: 1000, cachedTokens: 0, latencyMs: 1 },
			{ turn: 1, promptTokens: 1000, cachedTokens: 900, latencyMs: 1 },
			{ turn: 2, promptTokens: 1000, cachedTokens: 950, latencyMs: 1 },
		];
		expect(warmCacheHitRatio(turns)).toBeCloseTo(0.925, 3);
	});

	it("skips errored warm turns", () => {
		const turns = [
			{ turn: 0, promptTokens: 1000, cachedTokens: 0, latencyMs: 1 },
			{ turn: 1, promptTokens: 0, cachedTokens: 0, latencyMs: 1, error: "fail" },
			{ turn: 2, promptTokens: 1000, cachedTokens: 500, latencyMs: 1 },
		];
		expect(warmCacheHitRatio(turns)).toBeCloseTo(0.5, 3);
	});
});

describe("summarizeMode and pickWinner", () => {
	const trial = (ratio: number, trialNum: number): TrialResult => ({
		mode: "stable",
		trial: trialNum,
		nonce: `n${trialNum}`,
		turns: [
			{ turn: 0, promptTokens: 1000, cachedTokens: 0, latencyMs: 100 },
			{ turn: 1, promptTokens: 1000, cachedTokens: Math.round(1000 * ratio), latencyMs: 50 },
		],
	});

	it("computes median across trials", () => {
		const summary = summarizeMode("stable", [trial(0.9, 1), trial(0.7, 2), trial(0.8, 3)], 2);
		expect(summary.warmCacheHitRatioMedian).toBeCloseTo(0.8, 3);
	});

	it("picks winner with >=5pp median gap", () => {
		const report = buildReport(
			{
				baseUrl: "https://api.z.ai/api/coding/paas/v4",
				apiKey: "x",
				model: "glm-4.6",
				trials: 2,
				turns: 2,
				prefixLines: 10,
				retryAttempts: 1,
				retryDelayMs: 1,
				turnDelayMs: 0,
				trialDelayMs: 0,
				timeoutMs: 1000,
			},
			new Map([
				["stable", [trial(0.95, 1), trial(0.93, 2)]],
				["none", [trial(0.6, 1), trial(0.55, 2)]],
				["rotating", [trial(0.5, 1), trial(0.45, 2)]],
			]),
		);
		expect(pickWinner(report.summaries)).toBe("stable");
	});

	it("returns inconclusive when medians are close", () => {
		const report = buildReport(
			{
				baseUrl: "https://api.z.ai/api/coding/paas/v4",
				apiKey: "x",
				model: "glm-4.6",
				trials: 1,
				turns: 2,
				prefixLines: 10,
				retryAttempts: 1,
				retryDelayMs: 1,
				turnDelayMs: 0,
				trialDelayMs: 0,
				timeoutMs: 1000,
			},
			new Map([
				["stable", [trial(0.92, 1)]],
				["none", [trial(0.9, 1)]],
				["rotating", [trial(0.88, 1)]],
			]),
		);
		expect(report.winner).toBe("inconclusive");
	});
});

describe("buildStablePrefix", () => {
	it("embeds nonce for isolation", () => {
		const a = buildStablePrefix("aaa", 3);
		const b = buildStablePrefix("bbb", 3);
		expect(a).toContain("aaa");
		expect(b).toContain("bbb");
		expect(a).not.toBe(b);
	});
});

describe("formatPercent", () => {
	it("formats ratio", () => {
		expect(formatPercent(0.925)).toBe("92.5%");
	});
});
