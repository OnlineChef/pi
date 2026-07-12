import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	analyzeSystemPromptSections,
	applyZaiCompactionInstructions,
	applyZaiTreeSummaryInstructions,
	buildCacheSegmentKey,
	canonicalStableSystemPrefix,
	detectSegmentChange,
	fingerprintSystemPrompt,
	fingerprintToolset,
	formatSegmentChangeReason,
	isZaiModel,
} from "./cache/index.ts";
import { createDefaultZaiCommandDeps, registerZaiCommands } from "./commands/index.ts";
import { loadZaiConfig, type ZaiConfig } from "./config.ts";
import { formatPiCredentialSource } from "./credentials.ts";
import { syncProviderRegistration } from "./platform-provider.ts";
import { formatConnectionErrorHint, isConnectionErrorMessage } from "./resilience.ts";
import {
	dispatchZaiHook,
	getCacheMetricsStore,
	getTpsTracker,
	inferEndpoint,
	isZaiProvider,
	newSessionAffinityId,
	resetCacheMetrics,
	resetTpsMetrics,
	sessionState,
} from "./state.ts";
import { clearZaiStatus, updateZaiTpsStatus } from "./telemetry/status.ts";

export { loadZaiConfig, type ZaiConfig } from "./config.ts";
export { formatPiCredentialSource } from "./credentials.ts";
export {
	buildPlatformModelCatalog,
	GLM52_THINKING_LEVEL_MAP,
	PLATFORM_BASE_URL,
} from "./model-catalog.ts";
export {
	applyPreserveThinkingOverrides,
	clearPreserveThinkingOverrides,
	registerZaiPlatformProvider,
	syncProviderRegistration,
} from "./platform-provider.ts";
export {
	createZaiSessionState,
	dispatchZaiHook,
	getCacheMetricsStore,
	getZaiHookHandlers,
	inferEndpoint,
	isZaiProvider,
	resetCacheMetrics,
	sessionState,
	setZaiHookHandlers,
	type ZaiEndpointKind,
	type ZaiHookHandlers,
	type ZaiSessionState,
} from "./state.ts";

const EXTENSION_VERSION = "0.1.0";

function updateSessionFromModel(
	model: Model<any> | undefined,
	thinkingLevel: ReturnType<ExtensionAPI["getThinkingLevel"]>,
): void {
	if (!model) {
		sessionState.provider = undefined;
		sessionState.modelId = undefined;
		sessionState.endpoint = "unknown";
		sessionState.credentialSource = undefined;
		sessionState.thinkingLevel = thinkingLevel;
		return;
	}

	sessionState.provider = model.provider;
	sessionState.modelId = model.id;
	sessionState.endpoint = inferEndpoint(model.provider, model.baseUrl);
	sessionState.thinkingLevel = thinkingLevel;
}

function updateCacheSegment(model: Model<any>, systemPrompt: string, tools: { name: string }[]): void {
	const segment = buildCacheSegmentKey({
		provider: model.provider,
		baseUrl: model.baseUrl,
		model: model.id,
		systemFingerprint: fingerprintSystemPrompt(canonicalStableSystemPrefix(systemPrompt)),
		toolsetFingerprint: fingerprintToolset(tools),
	});
	const store = getCacheMetricsStore();
	const change = detectSegmentChange(store.get()?.segment, segment);
	if (change.changed) {
		store.reset(segment, formatSegmentChangeReason(change));
	} else {
		store.updateSegment(segment, "unchanged");
	}
}

function needsClearThinkingCompatOverride(payload: unknown, config: ZaiConfig): boolean {
	if (config.preserveThinking) return false;
	const thinking = (payload as { thinking?: { type?: string; clear_thinking?: boolean } })?.thinking;
	return thinking?.type === "enabled" && thinking.clear_thinking === false;
}

export default function piZaiExtension(pi: ExtensionAPI): void {
	let config: ZaiConfig = loadZaiConfig();

	sessionState.preserveThinking = config.preserveThinking;
	syncProviderRegistration(pi, config);
	registerZaiCommands(pi, createDefaultZaiCommandDeps(EXTENSION_VERSION));

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "reload") {
			config = loadZaiConfig(ctx.cwd);
			sessionState.preserveThinking = config.preserveThinking;
			syncProviderRegistration(pi, config);
		} else {
			resetCacheMetrics();
			resetTpsMetrics();
			sessionState.sessionAffinityId = newSessionAffinityId();
		}

		updateSessionFromModel(ctx.model, pi.getThinkingLevel());
		if (ctx.model && isZaiProvider(ctx.model.provider)) {
			sessionState.credentialSource = formatPiCredentialSource(ctx.model.provider, ctx.modelRegistry);
		} else {
			sessionState.credentialSource = undefined;
		}

		await dispatchZaiHook("onSessionStart", event, ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		resetCacheMetrics();
		resetTpsMetrics();
		clearZaiStatus(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		updateSessionFromModel(event.model, pi.getThinkingLevel());
		if (isZaiProvider(event.model.provider)) {
			sessionState.credentialSource = formatPiCredentialSource(event.model.provider, ctx.modelRegistry);
		} else {
			clearZaiStatus(ctx);
		}
		await dispatchZaiHook("onModelSelect", event, ctx);
	});

	pi.on("message_start", async (event, ctx) => {
		if (event.message.role !== "assistant" || !ctx.model || !isZaiModel(ctx.model)) {
			return;
		}
		getTpsTracker().beginAssistantMessage();
	});

	pi.on("message_update", async (event, ctx) => {
		if (event.message.role !== "assistant" || !ctx.model || !isZaiModel(ctx.model)) {
			return;
		}
		getTpsTracker().markFirstToken();
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant" || !ctx.model || !isZaiModel(ctx.model)) {
			return;
		}
		const sample = getTpsTracker().completeAssistantMessage(event.message.usage, event.message.timestamp);
		updateZaiTpsStatus(ctx, config, sample, getTpsTracker().get());
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!ctx.model || !isZaiModel(ctx.model)) return;
		const toolNames = pi.getActiveTools().map((name) => ({ name }));
		const stablePrefix = canonicalStableSystemPrefix(event.systemPrompt);
		updateCacheSegment(ctx.model, event.systemPrompt, toolNames);
		const analysis = analyzeSystemPromptSections(event.systemPrompt);
		sessionState.promptStability = {
			stableLineCount: analysis.stableLineCount,
			volatileLineCount: analysis.volatileLineCount,
			hasDynamicMarker: analysis.hasDynamicMarker,
			systemFingerprint: fingerprintSystemPrompt(stablePrefix),
		};
	});

	pi.on("turn_end", async (event, ctx) => {
		sessionState.thinkingLevel = pi.getThinkingLevel();
		if (ctx.model && isZaiModel(ctx.model) && event.message.role === "assistant" && event.message.usage) {
			getCacheMetricsStore().record(ctx.model, event.message.usage);
		}
		await dispatchZaiHook("onTurnEnd", event, ctx);
	});

	pi.on("session_compact", async () => {
		getCacheMetricsStore().markCompaction();
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (!ctx.model || !isZaiModel(ctx.model)) return;
		applyZaiCompactionInstructions(event);
	});

	pi.on("session_before_tree", async (_event, ctx) => {
		if (!ctx.model || !isZaiModel(ctx.model)) return;
		return applyZaiTreeSummaryInstructions();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (!ctx.model || !isZaiModel(ctx.model)) return;
		for (let i = ctx.sessionManager.getBranch().length - 1; i >= 0; i -= 1) {
			const entry = ctx.sessionManager.getBranch()[i];
			if (entry.type !== "message" || entry.message.role !== "assistant") continue;
			const assistant = entry.message as AssistantMessage;
			if (assistant.stopReason !== "error" || !isConnectionErrorMessage(assistant.errorMessage)) {
				return;
			}
			ctx.ui.notify(formatConnectionErrorHint(ctx.model), "warning");
			return;
		}
	});

	pi.on("before_provider_request", async (event) => {
		if (!needsClearThinkingCompatOverride(event.payload, config)) return;
		const payload = event.payload as Record<string, unknown>;
		const thinking = payload.thinking as { type: string; clear_thinking?: boolean };
		return {
			...payload,
			thinking: { ...thinking, clear_thinking: true },
		};
	});

	pi.on("before_provider_headers", async (event) => {
		if (!isZaiProvider(sessionState.provider)) return;
		// Z.AI load-balances on X-Session-Id; a stable id pins requests to the
		// same backend node so the implicit prefix cache stays warm.
		event.headers["X-Session-Id"] = sessionState.sessionAffinityId;
	});
}
