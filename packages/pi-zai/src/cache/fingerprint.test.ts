import { describe, expect, it } from "vitest";
import { canonicalizeStablePrefix, fingerprintSystemPrompt, fingerprintToolset } from "./fingerprint.ts";

describe("fingerprint", () => {
	it("excludes timestamps and token counts from system prompt fingerprint", () => {
		const base = "You are a helpful assistant.\nFollow project rules.";
		const withVolatile = `${base}\nCurrent time: 2026-07-12T06:43:00Z\nToken count: 12345`;
		expect(fingerprintSystemPrompt(base)).toBe(fingerprintSystemPrompt(withVolatile));
	});

	it("excludes git status lines from fingerprint", () => {
		const base = "You are a helpful assistant.";
		const withGit = `${base}\nCurrent git status\nOn branch main\nChanges not staged for commit`;
		expect(fingerprintSystemPrompt(base)).toBe(fingerprintSystemPrompt(withGit));
	});

	it("returns shortened 16-char hashes", () => {
		const hash = fingerprintSystemPrompt("stable prompt");
		expect(hash).toHaveLength(16);
		expect(hash).toMatch(/^[a-f0-9]+$/);
	});

	it("fingerprints toolsets with stable order and schema key order", () => {
		const toolsA = [
			{
				name: "read",
				description: "Read files",
				parameters: { type: "object", properties: { path: { type: "string" } } },
			},
			{ name: "write", description: "Write files" },
		];
		const toolsB = [
			{ name: "write", description: "Write files" },
			{
				name: "read",
				description: "Read files",
				parameters: { properties: { path: { type: "string" } }, type: "object" },
			},
		];
		expect(fingerprintToolset(toolsA)).toBe(fingerprintToolset(toolsB));
	});

	it("canonicalizeStablePrefix normalizes line endings", () => {
		expect(canonicalizeStablePrefix("a\r\nb")).toBe("a\nb");
	});
});
