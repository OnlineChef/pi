import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = import.meta.dirname;

function readSource(relativePath: string): string {
	return readFileSync(join(SOURCE_ROOT, relativePath), "utf-8");
}

describe("PR #1 local-only boundary", () => {
	it("does not define legacy telemetry hostnames in extension index", () => {
		const indexSource = readSource("index.ts");
		expect(indexSource).not.toContain("telemetry.pi-zai.chefgroep.online");
	});

	it("isolates remote upload fetch to telemetry uploader", () => {
		const uploaderSource = readSource("telemetry/uploader.ts");
		expect(uploaderSource).toContain("fetch");
		expect(readSource("privacy-preview.ts")).not.toMatch(/fetch\s*\(/);
	});
});

describe("PR #4 remote telemetry", () => {
	it("registers zai-telemetry command", () => {
		expect(readSource("commands/index.ts")).toContain("registerZaiTelemetryCommand");
	});

	it("supports aggregate telemetry mode in config", () => {
		expect(readSource("config.ts")).toContain('"aggregate"');
		expect(readSource("telemetry/consent.ts")).toContain("telemetry.consent.json");
	});
});

describe("PR #2 native Pi provider boundary", () => {
	it("does not register or unregister Pi native providers", () => {
		const indexSource = readSource("index.ts");
		expect(indexSource).not.toContain("registerProvider");
		expect(indexSource).not.toContain("unregisterProvider");
		expect(indexSource).not.toContain("syncProviderRegistration");
	});

	it("does not read PI_ZAI environment overrides in config", () => {
		const configSource = readSource("config.ts");
		expect(configSource).not.toContain("PI_ZAI_");
		expect(configSource).not.toContain("process.env");
	});

	it("normalizes thinking via before_provider_request hook", () => {
		const indexSource = readSource("index.ts");
		expect(indexSource).toContain("normalizeZaiThinkingPayload");
		expect(indexSource).toContain('pi.on("before_provider_request"');
	});
});

describe("PR #3 benchmark and privacy preview", () => {
	it("registers benchmark, privacy, and transport commands", () => {
		const commandsSource = readSource("commands/index.ts");
		expect(commandsSource).toContain("registerZaiBenchmarkCommand");
		expect(commandsSource).toContain("registerZaiPrivacyCommand");
		expect(commandsSource).toContain("registerZaiTransportCommand");
	});

	it("implements benchmark run tracking actions", () => {
		const benchmarkSource = readSource("commands/benchmark.ts");
		expect(benchmarkSource).toContain('"start"');
		expect(benchmarkSource).toContain('"complete"');
		expect(benchmarkSource).toContain("startBenchmarkRun");
		expect(benchmarkSource).toContain("completeBenchmarkRun");
	});

	it("applies safe prompt normalization only in safe mode", () => {
		const indexSource = readSource("index.ts");
		expect(indexSource).toContain("applySafePromptNormalization");
		expect(indexSource).toContain('config.promptStabilityMode === "safe"');
	});

	it("does not upload privacy preview data", () => {
		const privacySource = readSource("privacy-preview.ts");
		expect(privacySource).not.toMatch(/fetch\s*\(/);
		expect(privacySource).toContain("preview-only-not-sent");
	});
});
