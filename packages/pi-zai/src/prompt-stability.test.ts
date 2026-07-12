import { describe, expect, it } from "vitest";
import { resolvePromptStability, snapshotPromptStability } from "./prompt-stability.ts";

describe("snapshotPromptStability", () => {
	it("counts stable vs volatile lines", () => {
		const prompt = ["Project rules", "Current git status: dirty", "Always use TypeScript"].join("\n");
		const snap = snapshotPromptStability(prompt);
		expect(snap.stableLineCount).toBeGreaterThan(0);
		expect(snap.volatileLineCount).toBeGreaterThan(0);
		expect(snap.hasDynamicMarker).toBe(false);
		expect(snap.systemFingerprint?.length).toBe(16);
	});

	it("detects explicit dynamic context marker", () => {
		const prompt = "Project rules\n\n--- dynamic context ---\nCurrent timestamp: now";
		const snap = snapshotPromptStability(prompt);
		expect(snap.hasDynamicMarker).toBe(true);
		expect(snap.volatileLineCount).toBeGreaterThan(0);
	});
});

describe("resolvePromptStability", () => {
	it("prefers cached snapshot", () => {
		const cached = snapshotPromptStability("stable rules only");
		expect(resolvePromptStability("", cached)).toBe(cached);
	});

	it("computes from live system prompt when cache empty", () => {
		const live = resolvePromptStability("stable rules only", undefined);
		expect(live?.stableLineCount).toBeGreaterThan(0);
	});

	it("returns undefined without prompt or cache", () => {
		expect(resolvePromptStability(undefined, undefined)).toBeUndefined();
		expect(resolvePromptStability("   ", undefined)).toBeUndefined();
	});
});
