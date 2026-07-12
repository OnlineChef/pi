import { describe, expect, it } from "vitest";
import { DYNAMIC_CONTEXT_MARKER } from "./context-policy.ts";
import { applySafePromptNormalization } from "./prompt-safe.ts";

describe("applySafePromptNormalization", () => {
	it("does not change prompts without the dynamic marker", () => {
		const prompt = "Project rules\nCurrent git status: dirty";
		expect(applySafePromptNormalization(prompt)).toBeUndefined();
	});

	it("moves volatile lines below the marker", () => {
		const prompt = ["Stable rules", "Current git status: dirty", DYNAMIC_CONTEXT_MARKER.trim(), "Task context"].join(
			"\n",
		);
		const normalized = applySafePromptNormalization(prompt);
		expect(normalized).toBeDefined();
		expect(normalized).toContain("--- dynamic context ---");
		expect(normalized).not.toMatch(/Stable rules[\s\S]*Current git status[\s\S]*--- dynamic context ---/);
		expect(normalized).toContain("Current git status: dirty");
	});

	it("is idempotent", () => {
		const prompt = ["Stable rules", "Current git status: dirty", DYNAMIC_CONTEXT_MARKER.trim(), "Task context"].join(
			"\n",
		);
		const once = applySafePromptNormalization(prompt);
		expect(once).toBeDefined();
		expect(applySafePromptNormalization(once!)).toBeUndefined();
	});
});
