import type { ZaiConfig } from "./config.ts";
import type { ZaiSessionState } from "./state.ts";
import type { UsageSummary } from "./storage/types.ts";
import { isTelemetryUploadEnabled } from "./telemetry/sync.ts";

export type PrivacyPreviewSection = {
	title: string;
	lines: string[];
};

const LOCAL_ALLOWLIST = [
	"timestamps",
	"project/session hashes (local HMAC)",
	"query/request IDs",
	"attempt number",
	"provider/model/endpoint kind",
	"thinking level",
	"extension version",
	"system/toolset/payload fingerprints (local only)",
	"token counters",
	"latency values",
	"HTTP status",
	"controlled error category",
	"estimated API-equivalent cost",
];

const REMOTE_NEVER = [
	"prompts, code, reasoning, tool output",
	"API keys, paths, hostnames, repository names",
	"raw provider error bodies",
	"system/toolset/payload fingerprints",
	"install/session/project identifiers",
	"IP address as application field",
];

function bucketCount(value: number, edges: number[]): string {
	for (let i = 0; i < edges.length - 1; i += 1) {
		const low = edges[i]!;
		const high = edges[i + 1]!;
		const isLastBucket = i === edges.length - 2;
		if (value >= low && (isLastBucket ? value <= high : value < high)) {
			return `${low}-${high}`;
		}
	}
	return `${edges.at(-1)}+`;
}

export function buildAggregateTelemetryPreview(
	config: ZaiConfig,
	extensionVersion: string,
	sessionState: Pick<ZaiSessionState, "provider" | "modelId" | "endpoint" | "promptStability">,
	usage: UsageSummary,
): Record<string, unknown> {
	const hitRatio = usage.cacheHitRatio;
	return {
		schema: 1,
		status: isTelemetryUploadEnabled(config) ? "aggregate-ready" : "preview-only-not-sent",
		telemetryMode: config.telemetryMode,
		extensionVersion,
		model: sessionState.modelId ?? "unknown",
		endpointKind: sessionState.endpoint,
		promptMode: config.promptStabilityMode,
		turnBucket: bucketCount(usage.attempts, [0, 5, 20, 50, 100]),
		cacheRatioBucket: bucketCount(Math.round(hitRatio * 100), [0, 25, 50, 75, 90, 100]),
		retryRateBucket: bucketCount(usage.errors, [0, 2, 5, 10]),
		systemChanged: sessionState.promptStability?.hasDynamicMarker ?? false,
		toolsetChanged: false,
		payloadChangedOnRetry: false,
		errors: {
			note: "category counts only; no raw messages",
		},
	};
}

export function formatPrivacyPreview(
	config: ZaiConfig,
	extensionVersion: string,
	sessionState: Pick<
		ZaiSessionState,
		"projectId" | "sessionHash" | "provider" | "modelId" | "endpoint" | "promptStability"
	>,
	usage: UsageSummary,
): string {
	const aggregatePreview = buildAggregateTelemetryPreview(config, extensionVersion, sessionState, usage);
	const sections: PrivacyPreviewSection[] = [
		{
			title: "Local SQLite allowlist",
			lines: LOCAL_ALLOWLIST.map((line) => `  - ${line}`),
		},
		{
			title: "Never stored remotely (current build)",
			lines: REMOTE_NEVER.map((line) => `  - ${line}`),
		},
		{
			title: "Remote telemetry",
			lines: [
				`  mode: ${config.telemetryMode}`,
				isTelemetryUploadEnabled(config)
					? "  uploads: enabled (anonymous daily aggregates)"
					: "  uploads: disabled (run /zai-telemetry enable after setting mode aggregate)",
				"  Aggregate preview (current session rollup):",
				`  ${JSON.stringify(aggregatePreview, null, 2).split("\n").join("\n  ")}`,
			],
		},
		{
			title: "Current session (local hashes only)",
			lines: [
				`  projectId: ${sessionState.projectId ?? "unknown"}`,
				`  sessionHash: ${sessionState.sessionHash ?? "unknown"}`,
				`  provider: ${sessionState.provider ?? "none"}`,
				`  model: ${sessionState.modelId ?? "none"}`,
			],
		},
	];

	return ["pi-zai privacy preview", "", ...sections.flatMap((section) => [section.title, ...section.lines, ""])].join(
		"\n",
	);
}
