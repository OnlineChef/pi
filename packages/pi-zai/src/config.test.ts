import { describe, expect, it } from "vitest";
import { loadZaiConfig } from "./config.ts";

describe("loadZaiConfig telemetry", () => {
	it("defaults remote telemetry to off", () => {
		expect(loadZaiConfig("/tmp")).toMatchObject({
			telemetryMode: "off",
		});
	});
});
