import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMetricsStorage } from "../state.ts";
import { buildAggregatePayloadForDay } from "../telemetry/aggregate.ts";
import {
	clearTelemetryConsent,
	hasTelemetryConsent,
	readTelemetryConsent,
	writeTelemetryConsent,
} from "../telemetry/consent.ts";
import {
	isTelemetryUploadEnabled,
	resolveTelemetryIngestUrl,
	syncPendingTelemetry,
	uploadTelemetryDay,
} from "../telemetry/sync.ts";
import type { ZaiCommandDeps } from "./deps.ts";

const ACTIONS = ["status", "preview", "enable", "disable", "upload", "sync"] as const;

function utcYesterday(now = Date.now()): string {
	return new Date(now - 86_400_000).toISOString().slice(0, 10);
}

export function registerZaiTelemetryCommand(pi: ExtensionAPI, deps: ZaiCommandDeps): void {
	pi.registerCommand("zai-telemetry", {
		description: "Opt-in anonymous daily aggregate telemetry (Z.AI usage buckets only)",
		getArgumentCompletions: (prefix) => {
			const matches = ACTIONS.filter((value) => value.startsWith(prefix.trim().toLowerCase()));
			return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
		},
		handler: async (args, ctx) => {
			const tokens = args
				.trim()
				.split(/\s+/)
				.filter((token) => token.length > 0);
			const action = tokens[0]?.toLowerCase() ?? "status";
			const config = deps.getConfig(ctx.cwd);
			const storage = getMetricsStorage();

			switch (action) {
				case "status": {
					const consent = readTelemetryConsent();
					const lines = [
						"pi-zai remote telemetry",
						`  settings mode: ${config.telemetryMode}`,
						`  consent file: ${consent ? `opted in ${new Date(consent.optedInAt).toISOString()}` : "none"}`,
						`  uploads active: ${isTelemetryUploadEnabled(config) ? "yes" : "no"}`,
						`  ingest URL: ${resolveTelemetryIngestUrl(config)}`,
					];
					if (storage) {
						const pending = storage.listPendingTelemetryDays();
						lines.push(`  pending days: ${pending.length > 0 ? pending.join(", ") : "none"}`);
					}
					lines.push(
						"",
						"Enable: set zai.telemetry.mode to aggregate in settings.json, then /zai-telemetry enable",
						"Disable: /zai-telemetry disable",
					);
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}
				case "preview": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const day = tokens[1] ?? utcYesterday();
					const payload = buildAggregatePayloadForDay({
						day,
						config,
						extensionVersion: deps.extensionVersion,
						storage,
					});
					if (!payload) {
						ctx.ui.notify(`No anonymous aggregate data for ${day}.`, "warning");
						return;
					}
					ctx.ui.notify(
						[
							`Aggregate preview for ${day} (not sent until enabled + sync):`,
							JSON.stringify(payload, null, 2),
						].join("\n"),
						"info",
					);
					return;
				}
				case "enable": {
					if (config.telemetryMode !== "aggregate") {
						ctx.ui.notify(
							'Set "zai": { "telemetry": { "mode": "aggregate" } } in settings.json, /reload, then run /zai-telemetry enable again.',
							"warning",
						);
						return;
					}
					if (hasTelemetryConsent()) {
						ctx.ui.notify("Anonymous aggregate telemetry is already enabled.", "info");
						return;
					}
					const confirmed = await ctx.ui.confirm(
						"Enable anonymous telemetry?",
						"Upload anonymous daily aggregate usage to Online Chef Groep? No prompts, code, paths, or fingerprints are sent.",
					);
					if (!confirmed) return;
					writeTelemetryConsent();
					ctx.ui.notify(
						"Telemetry enabled. Completed UTC days upload on session start or via /zai-telemetry sync.",
						"info",
					);
					return;
				}
				case "disable":
					clearTelemetryConsent();
					ctx.ui.notify("Telemetry consent removed. Uploads stopped (settings mode unchanged).", "info");
					return;
				case "upload": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const day = tokens[1] ?? utcYesterday();
					const result = await uploadTelemetryDay({
						day,
						config,
						extensionVersion: deps.extensionVersion,
						storage,
					});
					if (result.ok) {
						ctx.ui.notify(
							`Uploaded aggregate for ${day}${result.status ? ` (HTTP ${result.status})` : ""}.`,
							"info",
						);
						return;
					}
					ctx.ui.notify(`Upload failed for ${day}: ${result.error ?? "unknown error"}`, "warning");
					return;
				}
				case "sync": {
					if (!storage) {
						ctx.ui.notify("Local metrics storage is not initialized.", "warning");
						return;
					}
					const result = await syncPendingTelemetry({
						config,
						extensionVersion: deps.extensionVersion,
						storage,
					});
					if (result.uploaded.length === 0 && result.skipped.length === 0) {
						ctx.ui.notify("No pending telemetry days to upload.", "info");
						return;
					}
					const lines = ["Telemetry sync complete."];
					if (result.uploaded.length > 0) {
						lines.push(`  uploaded: ${result.uploaded.map((entry) => entry.day).join(", ")}`);
					}
					if (result.skipped.length > 0) {
						lines.push(`  skipped: ${result.skipped.join("; ")}`);
					}
					ctx.ui.notify(lines.join("\n"), "info");
					return;
				}
				default:
					ctx.ui.notify(`Unknown action "${action}". Try: ${ACTIONS.join(", ")}`, "warning");
			}
		},
	});
}
