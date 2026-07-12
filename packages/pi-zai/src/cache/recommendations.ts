import type { SessionCacheStats } from "./metrics.ts";

export type CacheRecommendation = {
	priority: "high" | "medium" | "low";
	message: string;
};

const LOW_HIT_RATIO = 0.3;
const MEDIUM_HIT_RATIO = 0.55;

export function buildCacheRecommendations(stats: SessionCacheStats | undefined): CacheRecommendation[] {
	if (!stats || stats.rolling.requests < 2) {
		return [
			{
				priority: "low",
				message: "Send a few more Z.AI turns before judging cache efficiency.",
			},
		];
	}

	const recommendations: CacheRecommendation[] = [];
	const { rolling, segment, lastPrefixChangeReason } = stats;
	const promptTotal = rolling.input + rolling.cacheRead + rolling.cacheWrite;

	if (rolling.hitRatio < LOW_HIT_RATIO) {
		recommendations.push({
			priority: "high",
			message:
				"Cache hit ratio is low. Keep the system prompt stable, avoid editing tools mid-session, and append conversation history instead of rewriting prefixes.",
		});
	} else if (rolling.hitRatio < MEDIUM_HIT_RATIO) {
		recommendations.push({
			priority: "medium",
			message:
				"Cache hit ratio is moderate. Move volatile context (git status, timestamps, diagnostics) below the dynamic-context marker.",
		});
	}

	if (lastPrefixChangeReason && lastPrefixChangeReason !== "unchanged") {
		recommendations.push({
			priority: "high",
			message: `Recent prefix change (${lastPrefixChangeReason}) reset cache metrics. Reuse the same model, endpoint, tools, and stable system prompt to rebuild hits.`,
		});
	}

	if (rolling.cacheWrite > rolling.cacheRead && rolling.requests >= 3) {
		recommendations.push({
			priority: "medium",
			message:
				"Cache writes exceed reads in this segment. Avoid changing the system prompt or tool definitions between turns.",
		});
	}

	if (segment.endpoint === "platform" && rolling.estimatedSavings > 0 && promptTotal > 0) {
		const savingsRatio = rolling.estimatedSavings / Math.max(rolling.estimatedCost, 0.0001);
		if (savingsRatio < 0.05 && rolling.hitRatio < MEDIUM_HIT_RATIO) {
			recommendations.push({
				priority: "low",
				message:
					"Platform billing shows limited cache savings so far. Longer sessions with stable prefixes improve Z.AI implicit cache returns.",
			});
		}
	}

	if (recommendations.length === 0) {
		recommendations.push({
			priority: "low",
			message:
				"Cache efficiency looks healthy for this segment. Keep system prompts and toolsets stable across turns.",
		});
	}

	return recommendations;
}

export function formatCacheRecommendations(stats: SessionCacheStats | undefined): string[] {
	return buildCacheRecommendations(stats).map((item) => {
		const label = item.priority === "high" ? "!" : item.priority === "medium" ? "-" : "·";
		return `  ${label} ${item.message}`;
	});
}
