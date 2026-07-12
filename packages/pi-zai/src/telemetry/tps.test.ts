import { describe, expect, it } from "vitest";
import { computeTps, formatTpsStatusLine, TpsTracker } from "./tps.ts";

describe("computeTps", () => {
	it("returns tokens per second for valid samples", () => {
		expect(computeTps(100, 1000)).toBe(100);
		expect(computeTps(50, 500)).toBe(100);
	});

	it("returns zero for empty samples", () => {
		expect(computeTps(0, 1000)).toBe(0);
		expect(computeTps(100, 0)).toBe(0);
	});
});

describe("TpsTracker", () => {
	it("tracks last and rolling averages across assistant messages", () => {
		const tracker = new TpsTracker();
		tracker.beginAssistantMessage(0);
		tracker.markFirstToken(200);
		const first = tracker.completeAssistantMessage({ output: 100, reasoning: 20 }, 1000);
		expect(first?.tps).toBe(100);
		expect(first?.ttftMs).toBe(200);

		tracker.beginAssistantMessage(1000);
		const second = tracker.completeAssistantMessage({ output: 50, reasoning: 0 }, 2000);
		expect(second?.tps).toBe(50);

		const stats = tracker.get();
		expect(stats.last?.tps).toBe(50);
		expect(stats.rolling.requests).toBe(2);
		expect(stats.rolling.avgTps).toBe(75);
	});

	it("ignores completion without a matching start", () => {
		const tracker = new TpsTracker();
		expect(tracker.completeAssistantMessage({ output: 10, reasoning: 0 }, 1000)).toBeUndefined();
	});

	it("measures duration from wall clock end time", () => {
		const tracker = new TpsTracker();
		const started = Date.now();
		tracker.beginAssistantMessage(started);
		const ended = started + 2000;
		const sample = tracker.completeAssistantMessage({ output: 200, reasoning: 0 }, ended);
		expect(sample?.durationMs).toBeGreaterThanOrEqual(2000);
		expect(sample?.tps).toBeGreaterThanOrEqual(50);
		expect(sample?.tps).toBeLessThanOrEqual(150);
	});
});

describe("formatTpsStatusLine", () => {
	it("shows only last TPS by default", () => {
		const sample = {
			outputTokens: 100,
			reasoningTokens: 0,
			durationMs: 1000,
			ttftMs: 100,
			tps: 100,
			timestamp: 1000,
		};
		expect(
			formatTpsStatusLine(sample, { generationTokens: 100, durationMs: 1000, requests: 1, avgTps: 100 }, false),
		).toBe("100 tok/s");
	});

	it("includes session average when enabled", () => {
		const sample = {
			outputTokens: 50,
			reasoningTokens: 0,
			durationMs: 1000,
			ttftMs: undefined,
			tps: 50,
			timestamp: 2000,
		};
		expect(
			formatTpsStatusLine(sample, { generationTokens: 150, durationMs: 2000, requests: 2, avgTps: 75 }, true),
		).toBe("50 tok/s (avg 75)");
	});
});
