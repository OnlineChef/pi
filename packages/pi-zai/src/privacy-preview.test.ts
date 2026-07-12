import { describe, expect, it } from "vitest";
import { loadZaiConfig } from "./config.ts";
import { buildAggregateTelemetryPreview, formatPrivacyPreview } from "./privacy-preview.ts";
import { snapshotPromptStability } from "./prompt-stability.ts";
import { EMPTY_USAGE_SUMMARY } from "./storage/types.ts";

describe("privacy preview", () => {
	it("never includes fingerprints in aggregate preview", () => {
		const config = loadZaiConfig("/tmp");
		const preview = buildAggregateTelemetryPreview(
			config,
			"0.2.0",
			{
				provider: "zai",
				modelId: "glm-5.2",
				endpoint: "coding",
				promptStability: snapshotPromptStability("rules\n\n--- dynamic context ---\nctx"),
			},
			{ ...EMPTY_USAGE_SUMMARY, attempts: 12, cacheHitRatio: 0.8 },
		);
		expect(preview.status).toBe("preview-only-not-sent");
		expect(preview.telemetryMode).toBe("off");
		expect(JSON.stringify(preview)).not.toMatch(/fingerprint/i);
	});

	it("documents local allowlist and disabled remote mode", () => {
		const config = loadZaiConfig("/tmp");
		const text = formatPrivacyPreview(
			config,
			"0.2.0",
			{
				projectId: "abc123",
				sessionHash: "def456",
				provider: "zai",
				modelId: "glm-5.2",
				endpoint: "coding",
				promptStability: undefined,
			},
			EMPTY_USAGE_SUMMARY,
		);
		expect(text).toContain("Local SQLite allowlist");
		expect(text).toContain("mode: off");
		expect(text).not.toContain("fetch(");
	});

	it("buckets exact upper boundaries inclusively", () => {
		const config = loadZaiConfig("/tmp");
		const preview = buildAggregateTelemetryPreview(
			config,
			"0.2.0",
			{ provider: "zai", modelId: "glm-5.2", endpoint: "coding", promptStability: undefined },
			{ ...EMPTY_USAGE_SUMMARY, attempts: 100, errors: 10, cacheHitRatio: 1 },
		);
		expect(preview.cacheRatioBucket).toBe("90-100");
		expect(preview.turnBucket).toBe("50-100");
		expect(preview.retryRateBucket).toBe("5-10");
	});
});
