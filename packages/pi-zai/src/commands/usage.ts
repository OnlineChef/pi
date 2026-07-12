import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { computeCacheRatios } from "../cache/metrics.ts";
import { fetchQuotaLimit, formatQuotaLimit, monitorBaseFromModelUrl } from "../usage-monitor.ts";
import { getCacheMetricsStore } from "./cache-state.ts";
import type { ZaiCommandDeps } from "./deps.ts";
import {
	formatDollarCost,
	formatPercent,
	formatTokens,
	formatUsageLine,
	getLastAssistantUsage,
	getSessionUsageTotals,
	isEstimatedCost,
	isSubscriptionManaged,
	requireZaiModel,
} from "./helpers.ts";

export function registerZaiUsageCommand(pi: ExtensionAPI, deps: ZaiCommandDeps): void {
	pi.registerCommand("zai-usage", {
		description: "Show native Pi usage with Z.AI cache and cost interpretation",
		handler: async (_args, ctx) => {
			const check = requireZaiModel(ctx);
			if ("error" in check) {
				ctx.ui.notify(check.error, "warning");
				return;
			}

			const model = check.model;
			const lastUsage = getLastAssistantUsage(ctx);
			const sessionTotals = getSessionUsageTotals(ctx);
			const cacheStats = getCacheMetricsStore().get();
			const sessionPrompt = sessionTotals.input + sessionTotals.cacheRead + sessionTotals.cacheWrite;
			const sessionRatios = computeCacheRatios({
				input: sessionTotals.input,
				cacheRead: sessionTotals.cacheRead,
				cacheWrite: sessionTotals.cacheWrite,
			});
			const rollingHitRatio =
				cacheStats && cacheStats.rolling.requests > 0 ? cacheStats.rolling.hitRatio : sessionRatios.hitRatio;

			const costInterpretation = isSubscriptionManaged(model)
				? "Dollar cost: subscription-managed (Coding Plan)"
				: isEstimatedCost(model)
					? `Estimated dollar cost: ${formatDollarCost(sessionTotals.cost)} (Platform API pricing metadata)`
					: "Dollar cost: unavailable";

			const lines = [
				"Z.AI usage",
				`Extension: @onlinechefgroep/pi-zai ${deps.extensionVersion}`,
				"",
				"Pi native token accounting",
				`  Requests: ${sessionTotals.requests}`,
				`  Uncached input: ${formatTokens(sessionTotals.input)}`,
				`  Cached input (cacheRead): ${formatTokens(sessionTotals.cacheRead)}`,
				`  Cache write: ${formatTokens(sessionTotals.cacheWrite)}`,
				`  Output: ${formatTokens(sessionTotals.output)}`,
				`  Total prompt: ${formatTokens(sessionPrompt)}`,
				"",
				"Z.AI interpretation",
				"  input = uncached prompt tokens",
				"  cacheRead = cached prompt tokens",
				"  total prompt = input + cacheRead + cacheWrite",
				`  Session hit ratio: ${formatPercent(sessionRatios.hitRatio)}`,
				`  Extension rolling hit ratio: ${formatPercent(rollingHitRatio)}`,
				`  ${costInterpretation}`,
				"",
				"Last request",
				lastUsage ? `  ${formatUsageLine(lastUsage)}` : "  none",
			];

			const monitorBase = monitorBaseFromModelUrl(model.baseUrl);
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (monitorBase && auth.ok && auth.apiKey) {
				const quota = await fetchQuotaLimit(monitorBase, auth.apiKey, { headers: auth.headers });
				lines.push("");
				if (quota.ok) {
					lines.push(...formatQuotaLimit(quota.data));
				} else {
					lines.push(`Coding Plan quota unavailable: ${quota.error}`);
				}
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
