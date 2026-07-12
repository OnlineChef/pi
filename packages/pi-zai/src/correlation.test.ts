import { describe, expect, it } from "vitest";
import { fingerprintPayload, hashSessionId, QueryCorrelation } from "./correlation.ts";

describe("hashSessionId", () => {
	it("returns a stable 16-char hash", () => {
		expect(hashSessionId("sess-123")).toBe(hashSessionId("sess-123"));
		expect(hashSessionId("sess-123")).toHaveLength(16);
	});
});

describe("fingerprintPayload", () => {
	it("is stable regardless of object key order", () => {
		const left = fingerprintPayload({ model: "glm-5.2", thinking: { type: "disabled", clear_thinking: true } });
		const right = fingerprintPayload({ thinking: { clear_thinking: true, type: "disabled" }, model: "glm-5.2" });
		expect(left).toBe(right);
	});
});

describe("QueryCorrelation", () => {
	it("tracks query and attempt ids", () => {
		const correlation = new QueryCorrelation();
		const queryId = correlation.beginQuery();
		const first = correlation.nextAttempt();
		const second = correlation.nextAttempt();

		expect(first.queryId).toBe(queryId);
		expect(second.queryId).toBe(queryId);
		expect(first.attempt).toBe(1);
		expect(second.attempt).toBe(2);
		expect(first.requestId).toContain(queryId);
	});
});
