import { describe, expect, it } from "vitest";
import { isZaiApiHost } from "./zai-fetch.ts";

describe("isZaiApiHost", () => {
	it("matches api.z.ai and subdomains", () => {
		expect(isZaiApiHost("api.z.ai")).toBe(true);
		expect(isZaiApiHost("telemetry.z.ai")).toBe(true);
	});

	it("does not match unrelated hosts", () => {
		expect(isZaiApiHost("api.openai.com")).toBe(false);
		expect(isZaiApiHost("notz.ai")).toBe(false);
	});
});
