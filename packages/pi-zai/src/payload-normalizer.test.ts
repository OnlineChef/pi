import { describe, expect, it } from "vitest";
import { loadZaiConfig } from "./config.ts";
import { normalizeZaiThinkingPayload } from "./payload-normalizer.ts";

describe("normalizeZaiThinkingPayload", () => {
	const costFirst = { ...loadZaiConfig(), preserveThinking: false };
	const preserve = { ...loadZaiConfig(), preserveThinking: true };

	it("forces clear_thinking=true when preserveThinking is off", () => {
		const result = normalizeZaiThinkingPayload({ thinking: { type: "enabled", clear_thinking: false } }, costFirst);
		expect(result?.thinking).toEqual({ type: "enabled", clear_thinking: true });
	});

	it("keeps clear_thinking=false when preserveThinking is on", () => {
		const result = normalizeZaiThinkingPayload({ thinking: { type: "enabled", clear_thinking: false } }, preserve);
		expect(result).toBeUndefined();
	});

	it("sets clear_thinking=false when preserveThinking is on and upstream defaulted to true", () => {
		const result = normalizeZaiThinkingPayload({ thinking: { type: "enabled", clear_thinking: true } }, preserve);
		expect(result?.thinking).toEqual({ type: "enabled", clear_thinking: false });
	});
});
