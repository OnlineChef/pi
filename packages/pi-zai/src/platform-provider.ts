import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { ZaiConfig } from "./config.ts";
import { loadZaiConfig } from "./config.ts";
import { buildPlatformModelCatalog, PLATFORM_BASE_URL } from "./model-catalog.ts";

const CODING_PLAN_API_KEYS = {
	zai: "$ZAI_API_KEY",
	"zai-coding-cn": "$ZAI_CODING_CN_API_KEY",
} as const;

type CodingPlanProvider = keyof typeof CODING_PLAN_API_KEYS;

function isZaiOpenAICompat(model: Model<Api>): boolean {
	if (model.api !== "openai-completions") return false;
	const compat = model.compat as { thinkingFormat?: string } | undefined;
	return compat?.thinkingFormat === "zai";
}

function toProviderModelConfig(model: Model<Api>, preserveThinking: boolean): ProviderModelConfig {
	const compat =
		isZaiOpenAICompat(model) && preserveThinking
			? ({ ...model.compat, zaiPreserveThinking: true } as unknown as ProviderModelConfig["compat"])
			: model.compat;

	return {
		id: model.id,
		name: model.name,
		api: model.api,
		baseUrl: model.baseUrl,
		reasoning: model.reasoning ?? false,
		thinkingLevelMap: model.thinkingLevelMap,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		headers: model.headers,
		compat,
	};
}

function builtinZaiModels(provider: CodingPlanProvider): Model<Api>[] {
	return getBuiltinModels(provider);
}

export function registerZaiPlatformProvider(pi: ExtensionAPI, config: ZaiConfig): void {
	pi.registerProvider("zai-platform", {
		name: "Z.AI Platform API",
		baseUrl: PLATFORM_BASE_URL,
		apiKey: "$ZAI_API_KEY",
		api: "openai-completions",
		authHeader: true,
		models: buildPlatformModelCatalog({ preserveThinking: config.preserveThinking }),
	});
}

export function applyPreserveThinkingOverrides(pi: ExtensionAPI): void {
	for (const provider of Object.keys(CODING_PLAN_API_KEYS) as CodingPlanProvider[]) {
		const models = builtinZaiModels(provider).map((model) => toProviderModelConfig(model, true));
		if (models.length === 0) continue;

		const sample = builtinZaiModels(provider)[0];
		pi.registerProvider(provider, {
			baseUrl: sample?.baseUrl,
			apiKey: CODING_PLAN_API_KEYS[provider],
			api: "openai-completions",
			authHeader: true,
			models,
		});
	}

	registerZaiPlatformProvider(pi, { ...loadZaiConfig(), preserveThinking: true });
}

export function clearPreserveThinkingOverrides(pi: ExtensionAPI, config: ZaiConfig): void {
	pi.unregisterProvider("zai");
	pi.unregisterProvider("zai-coding-cn");
	registerZaiPlatformProvider(pi, config);
}

export function syncProviderRegistration(pi: ExtensionAPI, config: ZaiConfig): void {
	if (config.preserveThinking) {
		applyPreserveThinkingOverrides(pi);
		return;
	}
	clearPreserveThinkingOverrides(pi, config);
}
