import { describe, expect, it } from "vitest";
import { loadZaiConfig } from "./config.ts";

describe("loadZaiConfig telemetry boundary", () => {
	it("keeps remote telemetry disabled regardless of settings", () => {
		// loadZaiConfig reads settings from disk; telemetryMode is always forced off in PR #1.
		expect(loadZaiConfig()).toMatchObject({
			telemetryMode: "off",
		});
	});
});
