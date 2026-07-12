import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	BENCHMARK_SCENARIOS,
	BENCHMARK_VARIANTS,
	formatBenchmarkInstructions,
	formatBenchmarkManifest,
} from "../benchmark/manifest.ts";

const ACTIONS = ["manifest", "instructions"] as const;

export function registerZaiBenchmarkCommand(pi: ExtensionAPI): void {
	pi.registerCommand("zai-benchmark", {
		description: "A0-A3 benchmark manifest and setup instructions",
		getArgumentCompletions: (prefix) => {
			const normalized = prefix.trim().toLowerCase();
			const actionMatches = ACTIONS.filter((value) => value.startsWith(normalized));
			if (actionMatches.length > 0) {
				return actionMatches.map((value) => ({ value, label: value }));
			}
			const variantMatches = BENCHMARK_VARIANTS.map((variant) => variant.id).filter((value) =>
				value.toLowerCase().startsWith(normalized),
			);
			if (variantMatches.length > 0) {
				return variantMatches.map((value) => ({ value, label: value }));
			}
			const scenarioMatches = BENCHMARK_SCENARIOS.map((scenario) => scenario.id).filter((value) =>
				value.startsWith(normalized),
			);
			return scenarioMatches.length > 0 ? scenarioMatches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const tokens = args
				.trim()
				.split(/\s+/)
				.filter((token) => token.length > 0);
			const action = tokens[0]?.toLowerCase() ?? "manifest";

			switch (action) {
				case "manifest":
					ctx.ui.notify(formatBenchmarkManifest(), "info");
					return;
				case "instructions": {
					const variantId = tokens[1];
					if (!variantId) {
						ctx.ui.notify("Usage: /zai-benchmark instructions <A0|A1|A2|A3> [scenario]", "warning");
						return;
					}
					ctx.ui.notify(formatBenchmarkInstructions(variantId, tokens[2]), "info");
					return;
				}
				default:
					ctx.ui.notify(`Unknown action "${action}". Try: ${ACTIONS.join(", ")}`, "warning");
			}
		},
	});
}
