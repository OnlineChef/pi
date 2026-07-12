import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AssistantMessage,
	clampThinkingLevel,
	getModel,
	getSupportedThinkingLevels,
	streamSimple,
} from "../src/compat.ts";

const mockState = vi.hoisted(() => ({
	lastParams: undefined as unknown,
}));

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: (params: unknown) => {
					mockState.lastParams = params;
					const stream = {
						async *[Symbol.asyncIterator]() {
							yield {
								choices: [{ delta: {}, finish_reason: "stop" }],
								usage: {
									prompt_tokens: 1,
									completion_tokens: 1,
									prompt_tokens_details: { cached_tokens: 0 },
									completion_tokens_details: { reasoning_tokens: 0 },
								},
							};
						},
					};
					const promise = Promise.resolve(stream) as Promise<typeof stream> & {
						withResponse: () => Promise<{
							data: typeof stream;
							response: { status: number; headers: Headers };
						}>;
					};
					promise.withResponse = async () => ({
						data: stream,
						response: { status: 200, headers: new Headers() },
					});
					return promise;
				},
			},
		};
	}

	return { default: FakeOpenAI };
});

describe("z.ai native thinking levels", () => {
	beforeEach(() => {
		mockState.lastParams = undefined;
	});

	it("exposes only off, high, and max for GLM-5.2", () => {
		for (const provider of ["zai", "zai-coding-cn"] as const) {
			const model = getModel(provider, "glm-5.2")!;
			expect(getSupportedThinkingLevels(model)).toEqual(["off", "high", "max"]);
		}
	});

	it("clamps legacy low and medium sessions to high", () => {
		const model = getModel("zai", "glm-5.2")!;
		expect(clampThinkingLevel(model, "low")).toBe("high");
		expect(clampThinkingLevel(model, "medium")).toBe("high");
		expect(clampThinkingLevel(model, "xhigh")).toBe("max");
	});

	it("maps native off to disabled thinking without reasoning_effort", async () => {
		const model = getModel("zai", "glm-5.2")!;
		let payload: unknown;
		await streamSimple(
			model,
			{ messages: [{ role: "user", content: "Hi", timestamp: Date.now() }] },
			{
				apiKey: "test",
				onPayload: (params) => {
					payload = params;
				},
			},
		).result();
		const params = (payload ?? mockState.lastParams) as { thinking?: unknown; reasoning_effort?: string };
		expect(params.thinking).toEqual({ type: "disabled", clear_thinking: true });
		expect(params.reasoning_effort).toBeUndefined();
	});
});

describe("z.ai cache-safe reasoning replay", () => {
	const assistantMessage: AssistantMessage = {
		role: "assistant",
		api: "openai-completions",
		provider: "zai",
		model: "glm-5.2",
		content: [
			{ type: "thinking", thinking: "step one", thinkingSignature: "reasoning_content" },
			{ type: "text", text: "Done." },
		],
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};

	beforeEach(() => {
		mockState.lastParams = undefined;
	});

	it("does not replay historical reasoning for high thinking by default", async () => {
		const model = getModel("zai", "glm-5.2")!;
		let payload: unknown;
		await streamSimple(
			model,
			{
				messages: [
					{ role: "user", content: "First", timestamp: Date.now() },
					assistantMessage,
					{ role: "user", content: "Second", timestamp: Date.now() },
				],
			},
			{
				apiKey: "test",
				reasoning: "high",
				onPayload: (params) => {
					payload = params;
				},
			},
		).result();
		const params = (payload ?? mockState.lastParams) as { messages?: Array<Record<string, unknown>> };
		const replayed = params.messages?.find((m) => m.role === "assistant");
		expect(replayed).not.toHaveProperty("reasoning_content");
	});

	it("does not replay historical reasoning for max thinking by default", async () => {
		const model = getModel("zai", "glm-5.2")!;
		let payload: unknown;
		await streamSimple(
			model,
			{
				messages: [
					{ role: "user", content: "First", timestamp: Date.now() },
					assistantMessage,
					{ role: "user", content: "Second", timestamp: Date.now() },
				],
			},
			{
				apiKey: "test",
				reasoning: "max",
				onPayload: (params) => {
					payload = params;
				},
			},
		).result();
		const params = (payload ?? mockState.lastParams) as { messages?: Array<Record<string, unknown>> };
		const replayed = params.messages?.find((m) => m.role === "assistant");
		expect(replayed).not.toHaveProperty("reasoning_content");
	});
});
