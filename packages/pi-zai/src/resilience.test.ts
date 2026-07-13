import { describe, expect, it } from "vitest";
import {
	classifyProbeOutcome,
	formatRetrySettingsAdvice,
	isConnectionErrorMessage,
	isProbeTransportSuccess,
	readPiRetrySettings,
} from "./resilience.ts";

describe("isConnectionErrorMessage", () => {
	it("matches common Z.AI transport failures", () => {
		expect(isConnectionErrorMessage("Connection error.")).toBe(true);
		expect(isConnectionErrorMessage("fetch failed")).toBe(true);
		expect(isConnectionErrorMessage("Recv failure: Verbinding is weggevallen")).toBe(true);
	});

	it("does not match auth or quota errors", () => {
		expect(isConnectionErrorMessage("HTTP 401 Unauthorized")).toBe(false);
		expect(isConnectionErrorMessage("insufficient_quota")).toBe(false);
	});
});

describe("formatRetrySettingsAdvice", () => {
	it("suggests provider retries when unset", () => {
		const advice = formatRetrySettingsAdvice({
			enabled: true,
			agentMaxRetries: 3,
			providerMaxRetries: 0,
		});
		expect(advice).toContain("retry.provider.maxRetries = 2");
	});

	it("returns undefined when settings already strong", () => {
		expect(
			formatRetrySettingsAdvice({
				enabled: true,
				agentMaxRetries: 5,
				providerMaxRetries: 2,
			}),
		).toBeUndefined();
	});
});

describe("readPiRetrySettings", () => {
	it("returns defaults when settings file is absent or unreadable", () => {
		const settings = readPiRetrySettings();
		expect(settings.enabled).toBe(true);
		expect(settings.agentMaxRetries).toBeGreaterThan(0);
	});
});

describe("isProbeTransportSuccess", () => {
	it("treats any HTTP response as transport success", () => {
		expect(isProbeTransportSuccess(200)).toBe(true);
		expect(isProbeTransportSuccess(401)).toBe(true);
		expect(isProbeTransportSuccess(429)).toBe(true);
		expect(isProbeTransportSuccess(502)).toBe(true);
	});

	it("rejects non-HTTP status codes", () => {
		expect(isProbeTransportSuccess(0)).toBe(false);
		expect(isProbeTransportSuccess(99)).toBe(false);
	});
});

describe("classifyProbeOutcome", () => {
	it("passes only when every attempt succeeded (no tolerated drops)", () => {
		expect(classifyProbeOutcome({ ok: 5, fail: 0 })).toBe("pass");
		expect(classifyProbeOutcome({ ok: 3, fail: 0 })).toBe("pass");
	});

	it("warns on any partial success — a single drop is an honest signal", () => {
		// Regression guard: an earlier fix tolerated up to 20% drops (4/5 → pass),
		// which painted a flaky international endpoint green. The policy must stay
		// strict so the doctor reports flakiness truthfully.
		expect(classifyProbeOutcome({ ok: 4, fail: 1 })).toBe("warn");
		expect(classifyProbeOutcome({ ok: 2, fail: 1 })).toBe("warn");
	});

	it("fails only when nothing got through", () => {
		expect(classifyProbeOutcome({ ok: 0, fail: 5 })).toBe("fail");
		expect(classifyProbeOutcome({ ok: 0, fail: 0 })).toBe("fail");
	});
});
