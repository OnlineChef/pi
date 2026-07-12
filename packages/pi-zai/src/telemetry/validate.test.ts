import { describe, expect, it } from "vitest";
import type { AggregateTelemetryPayload } from "./types.ts";
import { validateAggregatePayload } from "./validate.ts";

const payload: AggregateTelemetryPayload = {
	schema: 1,
	day: "2026-07-11",
	extensionVersion: "0.3.0",
	promptMode: "observe",
	attempts: 12,
	errors: 1,
	inputTokens: 100,
	cacheReadTokens: 900,
	cacheWriteTokens: 0,
	outputTokens: 50,
	turnBucket: "5-20",
	cacheRatioBucket: "75-90",
	retryRateBucket: "0-2",
	byProviderModel: [{ provider: "zai", model: "glm-5.2", endpointKind: "coding", attempts: 12, errors: 1 }],
	errorCategories: { timeout_before_headers: 1 },
};

describe("validateAggregatePayload", () => {
	it("accepts anonymous aggregate payloads", () => {
		expect(validateAggregatePayload(payload)).toBeUndefined();
	});

	it("rejects forbidden keys", () => {
		const bad = { ...payload, projectId: "abc" } as AggregateTelemetryPayload & { projectId: string };
		expect(validateAggregatePayload(bad)).toContain("forbidden");
	});
});
