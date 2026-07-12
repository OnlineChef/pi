import { describe, expect, it } from "vitest";
import { formatRetrySettingsAdvice, isConnectionErrorMessage, readPiRetrySettings } from "./resilience.ts";

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
