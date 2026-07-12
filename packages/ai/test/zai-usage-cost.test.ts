import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateCost, getModel, type Model, streamSimple, type Usage } from "../src/compat.ts";

const mockState = vi.hoisted(() => ({
	chunks: undefined as
		| Array<{
				choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }>;
				usage?: {
					prompt_tokens: number;
					completion_tokens: number;
					prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
					completion_tokens_details?: { reasoning_tokens?: number };
				};
		  }>
		| undefined,
}));

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: () => {
					const stream = {
						async *[Symbol.asyncIterator]() {
							const chunks = mockState.chunks ?? [
								{
									choices: [{ delta: {}, finish_reason: "stop" }],
									usage: {
										prompt_tokens: 1,
										completion_tokens: 1,
										prompt_tokens_details: { cached_tokens: 0 },
										completion_tokens_details: { reasoning_tokens: 0 },
									},
								},
							];
							for (const chunk of chunks) {
								yield chunk;
							}
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

function platformModel(): Model<"openai-completions"> {
	return {
		id: "glm-5.2",
		name: "GLM-5.2 Platform",
		api: "openai-completions",
		provider: "zai-platform",
		baseUrl: "https://api.z.ai/api/paas/v4",
		reasoning: true,
		input: ["text"],
		cost: {
			input: 0.6,
			output: 2,
			cacheRead: 0.06,
			cacheWrite: 0,
		},
		contextWindow: 1_000_000,
		maxTokens: 131_072,
		compat: {
			thinkingFormat: "zai",
			zaiToolStream: true,
		},
	};
}

function emptyCostUsage(overrides: Partial<Usage> = {}): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		...overrides,
	};
}

describe("z.ai usage parsing and cost", () => {
	beforeEach(() => {
		mockState.chunks = undefined;
	});

	it("splits prompt_tokens into input and cacheRead from cached_tokens", async () => {
		mockState.chunks = [
			{
				choices: [{ delta: { content: "OK" }, finish_reason: "stop" }],
				usage: {
					prompt_tokens: 1000,
					completion_tokens: 100,
					prompt_tokens_details: { cached_tokens: 800, cache_write_tokens: 0 },
					completion_tokens_details: { reasoning_tokens: 20 },
				},
			},
		];

		const model = getModel("zai", "glm-5.2")!;
		const response = await streamSimple(
			model,
			{
				messages: [{ role: "user", content: "Hi", timestamp: Date.now() }],
			},
			{ apiKey: "test", reasoning: "high" },
		).result();

		expect(response.usage.input).toBe(200);
		expect(response.usage.cacheRead).toBe(800);
		expect(response.usage.cacheWrite).toBe(0);
		expect(response.usage.output).toBe(100);
		expect(response.usage.reasoning).toBe(20);
		expect(response.usage.totalTokens).toBe(1100);
	});

	it("calculates platform cost with discounted cache-read pricing", () => {
		const model = platformModel();
		const usage = emptyCostUsage({
			input: 200,
			output: 100,
			cacheRead: 800,
			cacheWrite: 0,
			totalTokens: 1100,
		});

		calculateCost(model, usage);

		expect(usage.cost.input).toBeCloseTo((0.6 / 1_000_000) * 200, 12);
		expect(usage.cost.cacheRead).toBeCloseTo((0.06 / 1_000_000) * 800, 12);
		expect(usage.cost.output).toBeCloseTo((2 / 1_000_000) * 100, 12);
		expect(usage.cost.total).toBeCloseTo(usage.cost.input + usage.cost.cacheRead + usage.cost.output, 12);
	});

	it("reports zero cost for Coding Plan z.ai providers regardless of cache hits", async () => {
		mockState.chunks = [
			{
				choices: [{ delta: { content: "OK" }, finish_reason: "stop" }],
				usage: {
					prompt_tokens: 5000,
					completion_tokens: 500,
					prompt_tokens_details: { cached_tokens: 4500, cache_write_tokens: 0 },
					completion_tokens_details: { reasoning_tokens: 0 },
				},
			},
		];

		for (const provider of ["zai", "zai-coding-cn"] as const) {
			const model = getModel(provider, "glm-5.2")!;
			const response = await streamSimple(
				model,
				{
					messages: [{ role: "user", content: "Hi", timestamp: Date.now() }],
				},
				{ apiKey: "test", reasoning: "high" },
			).result();

			expect(response.usage.cacheRead).toBe(4500);
			expect(response.usage.cost).toEqual({
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			});
		}
	});
});
