import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMetricsStorage, sessionState } from "../state.ts";
import { clearLocalProjectSecret, projectIdForCwd } from "../storage/project-id.ts";
import type { ZaiCommandDeps } from "./deps.ts";

const ACTIONS = [
	"status",
	"clear-project",
	"clear-details",
	"clear-benchmarks",
	"clear-all",
	"export-json",
	"export-csv",
	"vacuum",
] as const;

function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined) return "unknown";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStatus(): string {
	const storage = getMetricsStorage();
	if (!storage) {
		return "Local metrics storage is not initialized.";
	}

	const status = storage.getStatus();
	const summary = storage.getUsageSummary({ projectId: sessionState.projectId });
	const lines = [
		"Z.AI local metrics",
		`  Storage: ${status.kind}${status.degraded ? " (degraded)" : ""}`,
		`  Location: ${status.location ?? "memory"}`,
		`  Database size: ${formatBytes(status.databaseBytes)}`,
		`  Detail rows: ${status.detailRows}`,
		`  Rollup rows: ${status.rollupRows}`,
		`  Benchmark rows: ${status.benchmarkRows}`,
		`  Project hash: ${sessionState.projectId ?? "unknown"}`,
		`  Session hash: ${sessionState.sessionHash ?? "unknown"}`,
		`  Attempts (project): ${summary.attempts}`,
		`  Cache hit ratio (project): ${summary.cacheHitRatio > 0 ? `${(summary.cacheHitRatio * 100).toFixed(1)}%` : "n/a"}`,
	];
	return lines.join("\n");
}

export function registerZaiDataCommand(pi: ExtensionAPI, _deps: ZaiCommandDeps): void {
	pi.registerCommand("zai-data", {
		description: "Local Z.AI metrics storage (status, wipe, export)",
		getArgumentCompletions: (prefix) => {
			const matches = ACTIONS.filter((value) => value.startsWith(prefix));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const storage = getMetricsStorage();
			if (!storage) {
				ctx.ui.notify("Local metrics storage is not initialized.", "warning");
				return;
			}

			const [action, ...rest] = args.trim().split(/\s+/);
			const normalized = action === "" ? "status" : action.toLowerCase();

			switch (normalized) {
				case "status":
					ctx.ui.notify(formatStatus(), "info");
					return;
				case "clear-project": {
					const projectId = sessionState.projectId ?? projectIdForCwd(ctx.cwd);
					storage.clearProject(projectId);
					ctx.ui.notify(`Cleared local metrics for project ${projectId}.`, "info");
					return;
				}
				case "clear-details":
					storage.clearDetails();
					ctx.ui.notify("Cleared detailed attempt rows (rollups retained).", "info");
					return;
				case "clear-benchmarks":
					storage.clearBenchmarks();
					ctx.ui.notify("Cleared benchmark rows.", "info");
					return;
				case "clear-all":
					storage.clearAll();
					clearLocalProjectSecret();
					sessionState.projectId = undefined;
					ctx.ui.notify("Cleared all local pi-zai metrics and rotated the local project secret.", "info");
					return;
				case "export-json":
				case "export-csv": {
					const pathArg = rest.join(" ").trim();
					if (!pathArg) {
						ctx.ui.notify(`Usage: /zai-data ${normalized} <path>`, "warning");
						return;
					}
					const format = normalized === "export-json" ? "json" : "csv";
					const projectId = sessionState.projectId ?? projectIdForCwd(ctx.cwd);
					const payload = storage.exportData(format, { projectId });
					const target = resolve(ctx.cwd, pathArg);
					writeFileSync(target, payload, "utf-8");
					ctx.ui.notify(`Exported ${format.toUpperCase()} metrics to ${target}`, "info");
					return;
				}
				case "vacuum":
					storage.vacuum();
					ctx.ui.notify("Vacuum completed.", "info");
					return;
				default:
					ctx.ui.notify(`Unknown action "${normalized}". Try: ${ACTIONS.join(", ")}`, "warning");
			}
		},
	});
}
