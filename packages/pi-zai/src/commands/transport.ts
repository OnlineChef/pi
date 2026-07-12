import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMetricsStorage, sessionState } from "../state.ts";
import { projectIdForCwd } from "../storage/project-id.ts";
import type { TransportSummary } from "../storage/types.ts";

function formatLatency(label: string, value: number | undefined): string | undefined {
	if (value === undefined) return undefined;
	return `  ${label}: ${value} ms`;
}

function formatTransportSummary(summary: TransportSummary): string {
	const lines = ["Z.AI transport summary (local)", `  Attempts: ${summary.attempts}`, `  Errors: ${summary.errors}`];
	const latencyLines = [
		formatLatency("Avg request to headers", summary.avgRequestToHeadersMs),
		formatLatency("Avg request to first delta", summary.avgRequestToFirstDeltaMs),
		formatLatency("Avg total", summary.avgTotalMs),
	].filter((line): line is string => line !== undefined);
	lines.push(...latencyLines);

	const categories = Object.entries(summary.errorCategories).sort((left, right) => right[1] - left[1]);
	if (categories.length > 0) {
		lines.push("  Error categories:");
		for (const [category, count] of categories) {
			lines.push(`    ${category}: ${count}`);
		}
	}

	return lines.join("\n");
}

export function registerZaiTransportCommand(pi: ExtensionAPI): void {
	pi.registerCommand("zai-transport", {
		description: "Local transport latency and error-category summary",
		handler: async (_args, ctx) => {
			const storage = getMetricsStorage();
			if (!storage) {
				ctx.ui.notify("Local metrics storage is not initialized.", "warning");
				return;
			}

			const projectId = sessionState.projectId ?? projectIdForCwd(ctx.cwd);
			const summary = storage.getTransportSummary({ projectId });
			ctx.ui.notify(formatTransportSummary(summary), "info");
		},
	});
}
