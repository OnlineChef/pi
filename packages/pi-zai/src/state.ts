import { randomUUID } from "node:crypto";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionContext, SessionStartEvent, TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { CacheMetricsStore } from "./cache/metrics.ts";
import { TpsTracker } from "./telemetry/tps.ts";

export type ZaiEndpointKind = "coding" | "platform" | "coding-cn" | "unknown";

export interface ZaiSessionState {
	preserveThinking: boolean;
	endpoint: ZaiEndpointKind;
	provider: string | undefined;
	modelId: string | undefined;
	thinkingLevel: ThinkingLevel | undefined;
	credentialSource: string | undefined;
	/**
	 * Stable per-session id sent as `X-Session-Id` for Z.AI cache affinity.
	 * Pinning consecutive requests to the same backend node keeps the implicit
	 * prefix cache warm, raising cache hit rates.
	 */
	sessionAffinityId: string;
	promptStability:
		| {
				stableLineCount: number;
				volatileLineCount: number;
				hasDynamicMarker: boolean;
				systemFingerprint: string | undefined;
		  }
		| undefined;
}

export interface ModelSelectEvent {
	type: "model_select";
	model: Model<any>;
	previousModel: Model<any> | undefined;
	source: "set" | "cycle" | "restore";
}

export interface ZaiHookHandlers {
	onSessionStart?: (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>;
	onModelSelect?: (event: ModelSelectEvent, ctx: ExtensionContext) => void | Promise<void>;
	onTurnEnd?: (event: TurnEndEvent, ctx: ExtensionContext) => void | Promise<void>;
}

const ZAI_PROVIDERS = new Set(["zai", "zai-coding-cn", "zai-platform"]);

export function isZaiProvider(provider: string | undefined): boolean {
	return provider !== undefined && ZAI_PROVIDERS.has(provider);
}

export function inferEndpoint(provider: string | undefined, baseUrl?: string): ZaiEndpointKind {
	if (provider === "zai-platform") return "platform";
	if (provider === "zai-coding-cn") return "coding-cn";
	if (provider === "zai" || baseUrl?.includes("/coding/")) return "coding";
	return "unknown";
}

export function newSessionAffinityId(): string {
	return `pi-${randomUUID()}`;
}

export function createZaiSessionState(preserveThinking = false): ZaiSessionState {
	return {
		preserveThinking,
		endpoint: "unknown",
		provider: undefined,
		modelId: undefined,
		thinkingLevel: undefined,
		credentialSource: undefined,
		sessionAffinityId: newSessionAffinityId(),
		promptStability: undefined,
	};
}

export const sessionState = createZaiSessionState();

let hookHandlers: ZaiHookHandlers = {};
let cacheMetricsStore = new CacheMetricsStore();
let tpsTracker = new TpsTracker();

export function getCacheMetricsStore(): CacheMetricsStore {
	return cacheMetricsStore;
}

export function getTpsTracker(): TpsTracker {
	return tpsTracker;
}

export function resetCacheMetrics(): void {
	cacheMetricsStore = new CacheMetricsStore();
}

export function resetTpsMetrics(): void {
	tpsTracker = new TpsTracker();
}

export function setZaiHookHandlers(handlers: ZaiHookHandlers): void {
	hookHandlers = handlers;
}

export function getZaiHookHandlers(): ZaiHookHandlers {
	return hookHandlers;
}

export async function dispatchZaiHook(
	name: keyof ZaiHookHandlers,
	event: SessionStartEvent | ModelSelectEvent | TurnEndEvent,
	ctx: ExtensionContext,
): Promise<void> {
	const handler = hookHandlers[name];
	if (!handler) return;
	await (handler as (nextEvent: typeof event, nextCtx: ExtensionContext) => void | Promise<void>)(event, ctx);
}
