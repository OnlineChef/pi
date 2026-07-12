export type BenchmarkVariantId = "A0" | "A1" | "A2" | "A3";

export type BenchmarkScenarioId =
	| "stable-conversation"
	| "explicit-dynamic-context"
	| "tool-drift"
	| "real-coding-session"
	| "controlled-failure";

export type BenchmarkVariant = {
	id: BenchmarkVariantId;
	label: string;
	description: string;
	extensionLoaded: boolean;
	settings: Record<string, unknown>;
};

export type BenchmarkScenario = {
	id: BenchmarkScenarioId;
	label: string;
	turns: number;
	description: string;
};

export const BENCHMARK_VARIANTS: readonly BenchmarkVariant[] = [
	{
		id: "A0",
		label: "Native Pi",
		description: "Pi native Z.AI path without pi-zai loaded",
		extensionLoaded: false,
		settings: {},
	},
	{
		id: "A1",
		label: "pi-zai observe",
		description: "Extension loaded; observe-only prompt stability; affinity off",
		extensionLoaded: true,
		settings: {
			promptStability: { mode: "observe" },
			sessionAffinity: "off",
			metrics: { mode: "local" },
			telemetry: { mode: "off" },
		},
	},
	{
		id: "A2",
		label: "pi-zai safe prompt",
		description: "A1 plus safe prompt normalization below explicit dynamic marker",
		extensionLoaded: true,
		settings: {
			promptStability: { mode: "safe" },
			sessionAffinity: "off",
			metrics: { mode: "local" },
			telemetry: { mode: "off" },
		},
	},
	{
		id: "A3",
		label: "pi-zai experimental affinity",
		description: "A2 plus experimental X-Session-Id (benchmark only; not default)",
		extensionLoaded: true,
		settings: {
			promptStability: { mode: "safe" },
			sessionAffinity: "experimental",
			metrics: { mode: "local" },
			telemetry: { mode: "off" },
		},
	},
];

export const BENCHMARK_SCENARIOS: readonly BenchmarkScenario[] = [
	{
		id: "stable-conversation",
		label: "Stable conversation",
		turns: 12,
		description: "Unchanged prompt/tools, no compaction",
	},
	{
		id: "explicit-dynamic-context",
		label: "Explicit dynamic context",
		turns: 12,
		description: "Only content below --- dynamic context --- changes",
	},
	{
		id: "tool-drift",
		label: "Tool drift",
		turns: 12,
		description: "Order, description, schema, or MCP tool changes",
	},
	{
		id: "real-coding-session",
		label: "Real coding session",
		turns: 25,
		description: "Read/search/diff/test/failure/repair with one compaction",
	},
	{
		id: "controlled-failure",
		label: "Controlled failure",
		turns: 8,
		description: "Timeout, interrupted stream, 429/500 where safely reproducible",
	},
];

export const BENCHMARK_SAMPLE_GATES = {
	sessionsPerVariantScenario: 5,
	turnsPerSession: 12,
	minTurnsPerVariant: 60,
	minTotalTurnsA0A3: 240,
	medianGapForAffinity: 0.05,
} as const;

export function findBenchmarkVariant(id: string): BenchmarkVariant | undefined {
	const normalized = id.trim().toUpperCase();
	return BENCHMARK_VARIANTS.find((variant) => variant.id === normalized);
}

export function findBenchmarkScenario(id: string): BenchmarkScenario | undefined {
	return BENCHMARK_SCENARIOS.find((scenario) => scenario.id === id.trim().toLowerCase());
}

export function formatBenchmarkManifest(): string {
	const lines = [
		"pi-zai benchmark manifest (A0-A3)",
		"",
		"Variants:",
		...BENCHMARK_VARIANTS.map((variant) => `  ${variant.id}  ${variant.label} — ${variant.description}`),
		"",
		"Scenarios:",
		...BENCHMARK_SCENARIOS.map((scenario) => `  ${scenario.id}  (${scenario.turns} turns) — ${scenario.description}`),
		"",
		"Sample gates before changing defaults:",
		`  ${BENCHMARK_SAMPLE_GATES.sessionsPerVariantScenario} sessions per variant/scenario`,
		`  ${BENCHMARK_SAMPLE_GATES.turnsPerSession}+ turns per session`,
		`  ${BENCHMARK_SAMPLE_GATES.minTotalTurnsA0A3}+ total measured turns across A0-A3`,
		`  ${Math.round(BENCHMARK_SAMPLE_GATES.medianGapForAffinity * 100)}pp median cache-hit gap for affinity winner`,
		"",
		"Live cache-affinity A/B: npm run benchmark:cache-affinity",
		"Instructions: /zai-benchmark instructions <A0|A1|A2|A3> [scenario]",
	];
	return lines.join("\n");
}

export function formatBenchmarkInstructions(variantId: string, scenarioId?: string): string {
	const variant = findBenchmarkVariant(variantId);
	if (!variant) {
		return `Unknown variant "${variantId}". Use A0, A1, A2, or A3.`;
	}

	const scenario = scenarioId ? findBenchmarkScenario(scenarioId) : BENCHMARK_SCENARIOS[0];
	if (!scenario) {
		return `Unknown scenario "${scenarioId}".`;
	}

	const settingsJson = JSON.stringify({ zai: variant.settings }, null, 2);

	return [
		`Benchmark instructions: ${variant.id} / ${scenario.id}`,
		"",
		variant.description,
		"",
		"Setup:",
		variant.extensionLoaded ? "  1. Install pi-zai and /reload" : "  1. Run Pi without pi-zai (A0 control)",
		`  2. Apply settings in .pi/settings.json or ~/.pi/agent/settings.json:`,
		...settingsJson.split("\n").map((line) => `     ${line}`),
		`  3. Select the same Z.AI model/provider across variants`,
		`  4. Run scenario "${scenario.label}" (${scenario.turns} turns)`,
		`     ${scenario.description}`,
		"",
		"Record locally:",
		"  /zai-cache status",
		"  /zai-transport",
		"  /zai-data export-json ./pi-zai-benchmark.json",
		"",
		"Do not change production defaults until sample gates in /zai-benchmark manifest are met.",
	].join("\n");
}
