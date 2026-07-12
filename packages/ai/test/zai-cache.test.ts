import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertMessages } from "../src/api/openai-completions.ts";
import {
	type AssistantMessage,
	type Context,
	getModel,
	type OpenAICompletionsCompat,
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

type ResolvedZaiCompat = Required<Omit<OpenAICompletionsCompat, "cacheControlFormat">> & {
	cacheControlFormat?: OpenAICompletionsCompat["cacheControlFormat"];
};

function buildZaiCompat(overrides?: Partial<OpenAICompletionsCompat>): ResolvedZaiCompat {
	return {
		supportsStore: false,
		supportsDeveloperRole: false,
		supportsReasoningEffort: true,
		supportsUsageInStreaming: true,
		maxTokensField: "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: false,
		thinkingFormat: "zai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		chatTemplateKwargs: {},
		zaiToolStream: true,
		zaiPreserveThinking: false,
		supportsStrictMode: true,
		sendSessionAffinityHeaders: false,
		supportsLongCacheRetention: true,
		...overrides,
	};
}

const emptyUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantWithThinking(thinking: string): AssistantMessage {
	return {
		role: "assistant",
		api: "openai-completions",
		provider: "zai",
		model: "glm-5.2",
		content: [
			{ type: "thinking", thinking, thinkingSignature: "reasoning_content" },
			{ type: "text", text: "Done." },
		],
		usage: emptyUsage,
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function assistantAfterCompaction(): AssistantMessage {
	return {
		role: "assistant",
		api: "openai-completions",
		provider: "zai",
		model: "glm-5.2",
		content: [{ type: "text", text: "Visible outcome preserved after compaction." }],
		usage: emptyUsage,
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function buildContext(assistant: AssistantMessage): Context {
	return {
		messages: [
			{ role: "user", content: "First", timestamp: Date.now() },
			assistant,
			{ role: "user", content: "Second", timestamp: Date.now() },
		],
	};
}

describe("z.ai cache-safe reasoning replay (convertMessages)", () => {
	const model = getModel("zai", "glm-5.2")!;

	it("omits historical reasoning_content in default cost-first mode", () => {
		const messages = convertMessages(model, buildContext(assistantWithThinking("hidden chain")), buildZaiCompat());
		const replayed = messages.find((message) => message.role === "assistant");
		expect(replayed).toBeDefined();
		expect(replayed).not.toHaveProperty("reasoning_content");
		expect(replayed).toMatchObject({ content: "Done." });
	});

	it("replays historical reasoning_content when preserve thinking is enabled", () => {
		const messages = convertMessages(
			model,
			buildContext(assistantWithThinking("prior reasoning")),
			buildZaiCompat({ zaiPreserveThinking: true }),
		);
		const replayed = messages.find((message) => message.role === "assistant");
		expect(replayed).toMatchObject({ reasoning_content: "prior reasoning", content: "Done." });
	});

	it("does not replay reasoning after compaction drops hidden thinking blocks", () => {
		const messages = convertMessages(model, buildContext(assistantAfterCompaction()), buildZaiCompat());
		const replayed = messages.find((message) => message.role === "assistant");
		expect(replayed).toBeDefined();
		expect(replayed).not.toHaveProperty("reasoning_content");
		expect(replayed).toMatchObject({ content: "Visible outcome preserved after compaction." });
	});

	it("does not replay empty hidden reasoning placeholders even when preserve thinking is enabled", () => {
		const hiddenReasoningAssistant: AssistantMessage = {
			...assistantWithThinking(""),
			content: [
				{ type: "thinking", thinking: "", thinkingSignature: "reasoning_content" },
				{ type: "text", text: "Answer without replayable reasoning." },
			],
		};
		const messages = convertMessages(
			model,
			buildContext(hiddenReasoningAssistant),
			buildZaiCompat({ zaiPreserveThinking: true }),
		);
		const replayed = messages.find((message) => message.role === "assistant");
		expect(replayed).not.toHaveProperty("reasoning_content");
	});
});

describe("z.ai cache-safe reasoning replay (buildParams)", () => {
	beforeEach(() => {
		mockState.lastParams = undefined;
	});

	it("sends clear_thinking=true for high thinking without preserve opt-in", async () => {
		const model = getModel("zai", "glm-5.2")!;
		let payload: unknown;
		await streamSimple(model, buildContext(assistantWithThinking("step one")), {
			apiKey: "test",
			reasoning: "high",
			onPayload: (params) => {
				payload = params;
			},
		}).result();
		const params = (payload ?? mockState.lastParams) as {
			messages?: Array<Record<string, unknown>>;
			thinking?: unknown;
		};
		const replayed = params.messages?.find((message) => message.role === "assistant");
		expect(replayed).not.toHaveProperty("reasoning_content");
		expect(params.thinking).toEqual({ type: "enabled", clear_thinking: true });
	});

	it("sends clear_thinking=true for max thinking without preserve opt-in", async () => {
		const model = getModel("zai", "glm-5.2")!;
		let payload: unknown;
		await streamSimple(model, buildContext(assistantWithThinking("step one")), {
			apiKey: "test",
			reasoning: "max",
			onPayload: (params) => {
				payload = params;
			},
		}).result();
		const params = (payload ?? mockState.lastParams) as {
			messages?: Array<Record<string, unknown>>;
			thinking?: unknown;
		};
		const replayed = params.messages?.find((message) => message.role === "assistant");
		expect(replayed).not.toHaveProperty("reasoning_content");
		expect(params.thinking).toEqual({ type: "enabled", clear_thinking: true });
	});

	it("replays reasoning and disables clear_thinking when preserve thinking is enabled", async () => {
		const baseModel = getModel("zai", "glm-5.2")!;
		const model = {
			...baseModel,
			compat: {
				...baseModel.compat,
				zaiPreserveThinking: true,
			},
		} as const;
		let payload: unknown;
		await streamSimple(model, buildContext(assistantWithThinking("prior reasoning")), {
			apiKey: "test",
			reasoning: "high",
			onPayload: (params) => {
				payload = params;
			},
		}).result();
		const params = (payload ?? mockState.lastParams) as {
			messages?: Array<Record<string, unknown>>;
			thinking?: unknown;
		};
		const replayed = params.messages?.find((message) => message.role === "assistant");
		expect(replayed).toMatchObject({ reasoning_content: "prior reasoning" });
		expect(params.thinking).toEqual({ type: "enabled", clear_thinking: false });
	});

	it("falls back to clear_thinking=true when preserve thinking cannot replay hidden reasoning safely", async () => {
		const baseModel = getModel("zai", "glm-5.2")!;
		const model = {
			...baseModel,
			compat: {
				...baseModel.compat,
				zaiPreserveThinking: true,
			},
		} as const;
		const hiddenReasoningAssistant: AssistantMessage = {
			...assistantWithThinking(""),
			content: [
				{ type: "thinking", thinking: "", thinkingSignature: "reasoning_content" },
				{ type: "text", text: "Answer." },
			],
		};
		let payload: unknown;
		await streamSimple(model, buildContext(hiddenReasoningAssistant), {
			apiKey: "test",
			reasoning: "high",
			onPayload: (params) => {
				payload = params;
			},
		}).result();
		const params = (payload ?? mockState.lastParams) as {
			messages?: Array<Record<string, unknown>>;
			thinking?: unknown;
		};
		const replayed = params.messages?.find((message) => message.role === "assistant");
		expect(replayed).not.toHaveProperty("reasoning_content");
		expect(params.thinking).toEqual({ type: "enabled", clear_thinking: true });
	});
});
