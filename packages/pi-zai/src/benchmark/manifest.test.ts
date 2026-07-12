import { describe, expect, it } from "vitest";
import { findBenchmarkScenario, findBenchmarkVariant, formatBenchmarkInstructions } from "./manifest.ts";

describe("benchmark manifest", () => {
	it("resolves A0-A3 variants", () => {
		expect(findBenchmarkVariant("a2")?.id).toBe("A2");
		expect(findBenchmarkVariant("unknown")).toBeUndefined();
	});

	it("resolves scenario ids", () => {
		expect(findBenchmarkScenario("tool-drift")?.turns).toBe(12);
	});

	it("formats setup instructions with settings JSON", () => {
		const text = formatBenchmarkInstructions("A2", "stable-conversation");
		expect(text).toContain("promptStability");
		expect(text).toContain("safe");
		expect(text).not.toContain("telemetry.pi-zai");
	});
});
