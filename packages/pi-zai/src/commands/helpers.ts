import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model, Usage } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isCodingPlanProvider, isPlatformProvider, isZaiModel } from "../cache/context-policy.ts";
import { endpointLabel } from "../cache/metrics.ts";
import type { ZaiConfig } from "../config.ts";
import { formatPiCredentialSource } from "../credentials.ts";

export type SessionUsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	requests: number;
};

type ZaiOpenAICompat = {
	zaiToolStream?: boolean;
};

export function getZaiCompat(model: Model<any> | undefined): ZaiOpenAICompat | undefined {
	return model?.compat as ZaiOpenAICompat | undefined;
}

export function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}

export function formatTokens(count: number): string {
	return count.toLocaleString("en-US");
}

export function formatDollarCost(amount: number): string {
	if (amount <= 0) return "$0.00";
	return `$${amount.toFixed(4)}`;
}

export function getEndpointLabel(model: Model<any>): string {
	return endpointLabel(model.provider, model.baseUrl);
}

export function describeClearThinking(
	config: ZaiConfig,
	thinkingLevel: ThinkingLevel,
	model: Model<any> | undefined,
): string {
	if (!model?.reasoning) {
		return "n/a (model has no reasoning)";
	}
	if (thinkingLevel === "off") {
		return "true (thinking disabled)";
	}
	if (config.preserveThinking) {
		return "false (preserved thinking enabled)";
	}
	return "true (default cost-first)";
}

export function describePreservedThinking(config: ZaiConfig): string {
	const source =
		process.env.PI_ZAI_PRESERVE_THINKING !== undefined ? "PI_ZAI_PRESERVE_THINKING" : "settings.json or default";
	if (config.preserveThinking) {
		return `enabled via ${source}`;
	}
	return `disabled (default; source: ${source})`;
}

export function describeThinkingPayload(
	config: ZaiConfig,
	thinkingLevel: ThinkingLevel,
	model: Model<any> | undefined,
): string {
	if (!model?.reasoning) {
		return "thinking disabled (non-reasoning model)";
	}
	const clearThinking = thinkingLevel !== "off" && config.preserveThinking ? "false" : "true";
	if (thinkingLevel === "off") {
		return 'type="disabled", clear_thinking=true';
	}
	const mapped = model.thinkingLevelMap?.[thinkingLevel];
	const effort = typeof mapped === "string" ? mapped : thinkingLevel;
	return `type="enabled", reasoning_effort="${effort}", clear_thinking=${clearThinking}`;
}

export function getLastAssistantUsage(ctx: ExtensionCommandContext): Usage | undefined {
	for (let i = ctx.sessionManager.getBranch().length - 1; i >= 0; i -= 1) {
		const entry = ctx.sessionManager.getBranch()[i];
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const assistant = entry.message as AssistantMessage;
		if (assistant.stopReason === "aborted" || assistant.stopReason === "error") continue;
		return assistant.usage;
	}
	return undefined;
}

export function getSessionUsageTotals(ctx: ExtensionCommandContext): SessionUsageTotals {
	const totals: SessionUsageTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		requests: 0,
	};

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const assistant = entry.message as AssistantMessage;
		const usage = assistant.usage;
		totals.input += usage.input;
		totals.output += usage.output;
		totals.cacheRead += usage.cacheRead;
		totals.cacheWrite += usage.cacheWrite;
		totals.cost += usage.cost.total;
		totals.requests += 1;
	}

	return totals;
}

export function formatCredentialSource(provider: string, ctx: Pick<ExtensionCommandContext, "modelRegistry">): string {
	return formatPiCredentialSource(provider, ctx.modelRegistry);
}

export function isSubscriptionManaged(model: Model<any> | undefined): boolean {
	return model !== undefined && isCodingPlanProvider(model.provider);
}

export function isEstimatedCost(model: Model<any> | undefined): boolean {
	return model !== undefined && isPlatformProvider(model.provider);
}

export function formatUsageLine(usage: Usage): string {
	const promptTotal = usage.input + usage.cacheRead + usage.cacheWrite;
	const hitRatio = promptTotal > 0 ? usage.cacheRead / promptTotal : 0;
	return [
		`input=${formatTokens(usage.input)}`,
		`cacheRead=${formatTokens(usage.cacheRead)}`,
		`cacheWrite=${formatTokens(usage.cacheWrite)}`,
		`output=${formatTokens(usage.output)}`,
		`hit=${formatPercent(hitRatio)}`,
		`cost=${formatDollarCost(usage.cost.total)}`,
	].join(", ");
}

export function requireZaiModel(ctx: ExtensionCommandContext): { model: Model<any> } | { error: string } {
	if (!ctx.model) {
		return { error: "No model selected. Choose a Z.AI model first." };
	}
	if (!isZaiModel(ctx.model)) {
		return { error: `Active model ${ctx.model.provider}/${ctx.model.id} is not a Z.AI provider.` };
	}
	return { model: ctx.model };
}
