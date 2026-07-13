import type { Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { glm52ThinkingMapOk, hasPlatformPricing } from "./doctor.ts";

/** Minimal model shape carrying only the fields the validators read. */
function withThinkingMap(thinkingLevelMap: Record<string, string | null> | undefined): Model<any> {
	return {
		id: "glm-5.2",
		name: "GLM-5.2",
		compat: { supportsReasoningEffort: true },
		reasoning: true,
		thinkingLevelMap,
	} as unknown as Model<any>;
}

function withCost(input: number, output: number): Model<any> {
	return {
		id: "glm-5.2",
		name: "GLM-5.2",
		cost: { input, output, cacheRead: 0, cacheWrite: 0 },
	} as unknown as Model<any>;
}

describe("glm52ThinkingMapOk", () => {
	// Regression guard: both shapes are functionally equivalent because pi's
	// clampThinkingLevel() routes xhigh → max either way. An earlier version of
	// this check hard-required xhigh === "max" and so flagged the built-in
	// zai/glm-5.2 (which hides xhigh) as a false-positive warning. Both shapes
	// must keep passing.
	it("accepts the built-in zai/glm-5.2 map (xhigh hidden)", () => {
		// Mirrors node_modules/@earendil-works/pi-ai/.../zai.models.js
		expect(
			glm52ThinkingMapOk(
				withThinkingMap({ minimal: null, low: null, medium: null, high: "high", xhigh: null, max: "max" }),
			),
		).toBe(true);
	});

	it("accepts the optional zai-platform catalog map (xhigh -> max)", () => {
		// Mirrors src/model-catalog.ts GLM52_THINKING_LEVEL_MAP
		expect(
			glm52ThinkingMapOk(
				withThinkingMap({ minimal: null, low: null, medium: null, high: "high", xhigh: "max", max: "max" }),
			),
		).toBe(true);
	});

	it("rejects a map that exposes a level meant to be clamped to high", () => {
		expect(
			glm52ThinkingMapOk(
				withThinkingMap({ minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" }),
			),
		).toBe(false);
	});

	it("rejects a map missing the high or max effort", () => {
		expect(
			glm52ThinkingMapOk(
				withThinkingMap({ minimal: null, low: null, medium: null, high: null, xhigh: null, max: "max" }),
			),
		).toBe(false);
	});

	it("rejects an undefined model or missing map", () => {
		expect(glm52ThinkingMapOk(undefined)).toBe(false);
		expect(glm52ThinkingMapOk(withThinkingMap(undefined))).toBe(false);
	});
});

describe("hasPlatformPricing", () => {
	it("is true when input or output cost is non-zero", () => {
		expect(hasPlatformPricing(withCost(1.4, 4.4))).toBe(true);
		expect(hasPlatformPricing(withCost(0, 0.2))).toBe(true);
	});

	it("is false when the platform provider is absent (undefined model)", () => {
		expect(hasPlatformPricing(undefined)).toBe(false);
	});

	it("is false when both rates are zero", () => {
		expect(hasPlatformPricing(withCost(0, 0))).toBe(false);
	});
});
