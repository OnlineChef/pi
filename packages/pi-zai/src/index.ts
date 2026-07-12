import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { clampThinkingLevel } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
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
import { applySafePromptNormalization } from "./cache/prompt-safe.ts";
import { createDefaultZaiCommandDeps, registerZaiCommands } from "./commands/index.ts";
import { loadZaiConfig, type ZaiConfig } from "./config.ts";
import { fingerprintPayload, hashSessionId } from "./correlation.ts";
import { formatPiCredentialSource } from "./credentials.ts";
import { isNativeZaiModel } from "./native-zai.ts";
import { normalizeZaiThinkingPayload } from "./payload-normalizer.ts";
import { snapshotPromptStability } from "./prompt-stability.ts";
import { formatConnectionErrorHint, isConnectionErrorMessage } from "./resilience.ts";
import {
	dispatchZaiHook,
	getAttemptTracker,
	getCacheMetricsStore,
	getMetricsStorage,
	getQueryCorrelation,
	getTpsTracker,
	inferEndpoint,
	isZaiProvider,
	newSessionAffinityId,
	resetCacheMetrics,
	resetCorrelationState,
	resetTpsMetrics,
	sessionState,
	setMetricsStorage,
	shouldRunDailyMetricsCleanup,
} from "./state.ts";
import { createMetricsStorage, projectIdForCwd } from "./storage/index.ts";
import { clearZaiStatus, updateZaiTpsStatus } from "./telemetry/status.ts";

export { loadZaiConfig, type ZaiConfig } from "./config.ts";
export { formatPiCredentialSource } from "./credentials.ts";
export {
	buildPlatformModelCatalog,
	GLM52_THINKING_LEVEL_MAP,
	PLATFORM_BASE_URL,
} from "./model-catalog.ts";
export { isNativeZaiModel } from "./native-zai.ts";
export { normalizeZaiThinkingPayload } from "./payload-normalizer.ts";
export {
	createZaiSessionState,
	dispatchZaiHook,
	getCacheMetricsStore,
	getMetricsStorage,
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

const EXTENSION_VERSION = "0.1.1";

function clampThinkingForModel(pi: ExtensionAPI, model: Model<any> | undefined): void {
	if (!model?.reasoning) return;
	const current = pi.getThinkingLevel();
	const clamped = clampThinkingLevel(model, current) as ThinkingLevel;
	if (clamped !== current) {
		pi.setThinkingLevel(clamped);
	}
}

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

function classifyTransportError(message: string | undefined, httpStatus?: number): string | undefined {
	if (httpStatus === 429) return "http_429";
	if (httpStatus !== undefined && httpStatus >= 500) return "http_5xx";
	if (httpStatus !== undefined && httpStatus >= 400) return "http_4xx";
	if (!message) return undefined;
	if (/timeout/i.test(message)) return "timeout_before_headers";
	if (/certificate|cert/i.test(message)) return "certificate";
	if (/tls|ssl/i.test(message)) return "tls";
	if (/proxy/i.test(message)) return "proxy";
	if (/dns|getaddrinfo|enotfound/i.test(message)) return "dns";
	if (/connect|refused|reset|hang up|recv failure/i.test(message)) return "tcp_connect";
	if (/stream|interrupted|terminated/i.test(message)) return "stream_interrupted";
	if (/context|length|overflow/i.test(message)) return "context_overflow";
	if (/auth|401|403|unauthorized|forbidden/i.test(message)) return "authentication";
	if (isConnectionErrorMessage(message)) return "unknown_transport";
	return undefined;
}

function ensureAttemptTrackingForTurnEnd(): void {
	if (getAttemptTracker().hasInFlight()) return;
	const { queryId, requestId, attempt } = getQueryCorrelation().nextAttempt();
	getAttemptTracker().beginAttempt({
		queryId,
		requestId,
		attempt,
		payloadFingerprint: "no-before-provider-request",
	});
}

async function ensureMetricsStorage(config: ZaiConfig, warn: (message: string) => void): Promise<void> {
	setMetricsStorage(await createMetricsStorage(config.metrics, warn));
}

export default function piZaiExtension(pi: ExtensionAPI): void {
	let config: ZaiConfig = loadZaiConfig();

	sessionState.preserveThinking = config.preserveThinking;
	registerZaiCommands(pi, createDefaultZaiCommandDeps(EXTENSION_VERSION));

	pi.on("session_start", async (event, ctx) => {
		config = loadZaiConfig(ctx.cwd);
		sessionState.preserveThinking = config.preserveThinking;
		if (event.reason !== "reload") {
			resetCacheMetrics();
			resetTpsMetrics();
			resetCorrelationState();
			sessionState.sessionAffinityId = newSessionAffinityId();
			sessionState.activeBenchmarkRunId = undefined;
		}

		sessionState.projectId = projectIdForCwd(ctx.cwd);
		sessionState.sessionHash = hashSessionId(ctx.sessionManager.getSessionId());
		await ensureMetricsStorage(config, (message) => ctx.ui.notify(message, "warning"));

		const storage = getMetricsStorage();
		if (storage && shouldRunDailyMetricsCleanup()) {
			storage.runCleanup(Date.now());
		}

		updateSessionFromModel(ctx.model, pi.getThinkingLevel());
		if (ctx.model) clampThinkingForModel(pi, ctx.model);
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
		sessionState.activeBenchmarkRunId = undefined;
		setMetricsStorage(undefined);
		clearZaiStatus(ctx);
	});

	pi.on("model_select", async (event, ctx) => {
		clampThinkingForModel(pi, event.model);
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
		getAttemptTracker().markFirstDelta();
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant" || !ctx.model || !isZaiModel(ctx.model)) {
			return;
		}
		const sample = getTpsTracker().completeAssistantMessage(event.message.usage, Date.now());
		updateZaiTpsStatus(ctx, config, sample, getTpsTracker().get());
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!ctx.model || !isZaiModel(ctx.model)) return;
		const queryId = getQueryCorrelation().beginQuery();
		getAttemptTracker().prepareQueryAttempt(queryId);
		const toolNames = pi.getActiveTools().map((name) => ({ name }));
		let systemPromptForMetrics = event.systemPrompt;
		if (config.promptStabilityMode === "safe") {
			const normalized = applySafePromptNormalization(event.systemPrompt);
			if (normalized !== undefined) {
				systemPromptForMetrics = normalized;
			}
		}
		updateCacheSegment(ctx.model, systemPromptForMetrics, toolNames);
		sessionState.promptStability = snapshotPromptStability(systemPromptForMetrics);

		if (config.promptStabilityMode === "safe" && systemPromptForMetrics !== event.systemPrompt) {
			return { systemPrompt: systemPromptForMetrics };
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		sessionState.thinkingLevel = pi.getThinkingLevel();
		if (ctx.model && isZaiModel(ctx.model) && event.message.role === "assistant" && event.message.usage) {
			getCacheMetricsStore().record(ctx.model, event.message.usage);

			const assistant = event.message as AssistantMessage;
			const segment = getCacheMetricsStore().get()?.segment;
			ensureAttemptTrackingForTurnEnd();
			const record = getAttemptTracker().buildRecord({
				projectId: sessionState.projectId ?? projectIdForCwd(ctx.cwd),
				sessionHash: sessionState.sessionHash ?? hashSessionId(ctx.sessionManager.getSessionId()),
				provider: ctx.model.provider,
				model: ctx.model.id,
				endpointKind: sessionState.endpoint,
				thinkingLevel: sessionState.thinkingLevel,
				extensionVersion: EXTENSION_VERSION,
				systemFingerprint: segment?.systemFingerprint,
				toolsetFingerprint: segment?.toolsetFingerprint,
				usage: event.message.usage,
				errorCategory:
					assistant.stopReason === "error" ? classifyTransportError(assistant.errorMessage, undefined) : undefined,
			});
			if (record) {
				getMetricsStorage()?.recordAttempt(record);
			}
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

	pi.on("before_provider_request", async (event, ctx) => {
		if (!ctx.model || !isNativeZaiModel(ctx.model)) {
			return;
		}

		const { queryId, requestId, attempt } = getQueryCorrelation().nextAttempt();
		if (attempt > 1 || !getAttemptTracker().hasInFlight()) {
			getAttemptTracker().beginAttempt({
				queryId,
				requestId,
				attempt,
				payloadFingerprint: fingerprintPayload(event.payload),
			});
		} else {
			getAttemptTracker().armProviderAttempt({
				requestId,
				attempt,
				payloadFingerprint: fingerprintPayload(event.payload),
			});
		}

		return normalizeZaiThinkingPayload(event.payload, config);
	});

	pi.on("after_provider_response", async (event, ctx) => {
		if (!ctx.model || !isNativeZaiModel(ctx.model)) return;
		getAttemptTracker().markHeadersReceived();
		getAttemptTracker().markResponse(
			event.status,
			event.status >= 400 ? classifyTransportError(undefined, event.status) : undefined,
		);
	});

	pi.on("before_provider_headers", async (event) => {
		if (!isZaiProvider(sessionState.provider)) return;
		if (config.sessionAffinity === "experimental") {
			event.headers["X-Session-Id"] = sessionState.sessionAffinityId;
		}
		event.headers["User-Agent"] = `pi-zai/${EXTENSION_VERSION}`;
		event.headers["Accept-Language"] = "en-US,en";
	});
}
