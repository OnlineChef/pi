import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Verified against https://docs.z.ai/guides/overview/pricing (USD per 1M tokens). */
export const PLATFORM_BASE_URL = "https://api.z.ai/api/paas/v4";

export const GLM52_THINKING_LEVEL_MAP = {
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	xhigh: null,
	max: "max",
} as const;

const BASE_ZAI_COMPAT = {
	supportsStore: false,
	supportsDeveloperRole: false,
	thinkingFormat: "zai",
} as const;

export type PlatformModelCatalogOptions = {
	preserveThinking?: boolean;
};

function withPreserveThinking(model: ProviderModelConfig, preserveThinking: boolean): ProviderModelConfig {
	if (!preserveThinking || !model.compat) return model;
	return {
		...model,
		compat: {
			...model.compat,
			zaiPreserveThinking: true,
		} as unknown as ProviderModelConfig["compat"],
	};
}

export function buildPlatformModelCatalog(options: PlatformModelCatalogOptions = {}): ProviderModelConfig[] {
	const preserveThinking = options.preserveThinking === true;
	const models: ProviderModelConfig[] = [
		{
			id: "glm-5.2",
			name: "GLM-5.2",
			reasoning: true,
			thinkingLevelMap: GLM52_THINKING_LEVEL_MAP,
			input: ["text"],
			cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
			contextWindow: 1_000_000,
			maxTokens: 131_072,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: true,
				zaiToolStream: true,
			},
		},
		{
			id: "glm-5.1",
			name: "GLM-5.1",
			reasoning: true,
			input: ["text"],
			cost: { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 },
			contextWindow: 200_000,
			maxTokens: 131_072,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: false,
				zaiToolStream: true,
			},
		},
		{
			id: "glm-5",
			name: "GLM-5",
			reasoning: true,
			input: ["text"],
			cost: { input: 1, output: 3.2, cacheRead: 0.2, cacheWrite: 0 },
			contextWindow: 200_000,
			maxTokens: 131_072,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: false,
				zaiToolStream: true,
			},
		},
		{
			id: "glm-5-turbo",
			name: "GLM-5-Turbo",
			reasoning: true,
			input: ["text"],
			cost: { input: 1.2, output: 4, cacheRead: 0.24, cacheWrite: 0 },
			contextWindow: 200_000,
			maxTokens: 131_072,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: false,
				zaiToolStream: true,
			},
		},
		{
			id: "glm-4.7",
			name: "GLM-4.7",
			reasoning: true,
			input: ["text"],
			cost: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
			contextWindow: 204_800,
			maxTokens: 131_072,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: false,
				zaiToolStream: true,
			},
		},
		{
			id: "glm-4.7-flashx",
			name: "GLM-4.7-FlashX",
			reasoning: true,
			input: ["text"],
			cost: { input: 0.07, output: 0.4, cacheRead: 0.01, cacheWrite: 0 },
			contextWindow: 200_000,
			maxTokens: 128_000,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: false,
				zaiToolStream: true,
			},
		},
		{
			id: "glm-4.5-air",
			name: "GLM-4.5-Air",
			reasoning: true,
			input: ["text"],
			cost: { input: 0.2, output: 1.1, cacheRead: 0.03, cacheWrite: 0 },
			contextWindow: 131_072,
			maxTokens: 98_304,
			compat: {
				...BASE_ZAI_COMPAT,
				supportsReasoningEffort: false,
			},
		},
	];

	return models.map((model) => withPreserveThinking(model, preserveThinking));
}
