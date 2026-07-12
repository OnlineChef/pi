import { describe, expect, it } from "vitest";
import {
	formatQuotaLimit,
	formatResetCountdown,
	levelLabel,
	monitorBaseFromModelUrl,
	type QuotaLimitData,
} from "./usage-monitor.ts";

describe("monitorBaseFromModelUrl", () => {
	it("derives origin from coding baseUrl", () => {
		expect(monitorBaseFromModelUrl("https://api.z.ai/api/coding/paas/v4")).toBe("https://api.z.ai");
	});

	it("derives origin from CN baseUrl", () => {
		expect(monitorBaseFromModelUrl("https://open.bigmodel.cn/api/coding/paas/v4")).toBe("https://open.bigmodel.cn");
	});

	it("returns undefined for invalid url", () => {
		expect(monitorBaseFromModelUrl("not a url")).toBeUndefined();
	});
});

describe("levelLabel", () => {
	it("maps known tiers", () => {
		expect(levelLabel("max")).toBe("Max");
		expect(levelLabel("standard")).toBe("Pro");
		expect(levelLabel("lite")).toBe("Lite");
	});

	it("passes through unknown tiers", () => {
		expect(levelLabel("enterprise")).toBe("enterprise");
	});
});

describe("formatResetCountdown", () => {
	const now = 1_000_000_000_000;

	it("returns empty for missing reset", () => {
		expect(formatResetCountdown(undefined, now)).toBe("");
	});

	it("formats minutes, hours, days", () => {
		expect(formatResetCountdown(now + 30 * 60_000, now)).toBe("reset in 30m");
		expect(formatResetCountdown(now + (2 * 60 + 15) * 60_000, now)).toBe("reset in 2h 15m");
		expect(formatResetCountdown(now + 3 * 24 * 60 * 60_000, now)).toBe("reset in 3d 0h");
	});

	it("handles past reset", () => {
		expect(formatResetCountdown(now - 1, now)).toBe("reset soon");
	});
});

describe("formatQuotaLimit", () => {
	const now = 1_000_000_000_000;
	const data: QuotaLimitData = {
		level: "max",
		limits: [
			{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 41, nextResetTime: now + 3 * 60 * 60_000 },
			{ type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 16, nextResetTime: now + 5 * 24 * 60 * 60_000 },
			{
				type: "TIME_LIMIT",
				unit: 5,
				number: 1,
				usage: 4000,
				currentValue: 3,
				remaining: 3997,
				percentage: 1,
				nextResetTime: now + 20 * 24 * 60 * 60_000,
				usageDetails: [
					{ modelCode: "search-prime", usage: 3 },
					{ modelCode: "web-reader", usage: 0 },
				],
			},
		],
	};

	it("renders plan tier header", () => {
		expect(formatQuotaLimit(data, now)[0]).toBe("Coding Plan quota (Max)");
	});

	it("labels token windows and MCP budget", () => {
		const out = formatQuotaLimit(data, now).join("\n");
		expect(out).toContain("5-Hours tokens");
		expect(out).toContain("1-Week tokens");
		expect(out).toContain("1-Month MCP tools");
		expect(out).toContain("3/4000 (1%)");
		expect(out).toContain("search-prime: 3");
	});
});
