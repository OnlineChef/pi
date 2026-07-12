import { analyzeSystemPromptSections, canonicalStableSystemPrefix, fingerprintSystemPrompt } from "./cache/index.ts";
import type { ZaiSessionState } from "./state.ts";

export type PromptStabilitySnapshot = NonNullable<ZaiSessionState["promptStability"]>;

export function snapshotPromptStability(systemPrompt: string): PromptStabilitySnapshot {
	const stablePrefix = canonicalStableSystemPrefix(systemPrompt);
	const analysis = analyzeSystemPromptSections(systemPrompt);
	return {
		stableLineCount: analysis.stableLineCount,
		volatileLineCount: analysis.volatileLineCount,
		hasDynamicMarker: analysis.hasDynamicMarker,
		systemFingerprint: fingerprintSystemPrompt(stablePrefix),
	};
}

/** Use cached hook snapshot, or compute live from Pi's current system prompt. */
export function resolvePromptStability(
	systemPrompt: string | undefined,
	cached: PromptStabilitySnapshot | undefined,
): PromptStabilitySnapshot | undefined {
	if (cached) return cached;
	if (!systemPrompt || systemPrompt.trim().length === 0) return undefined;
	return snapshotPromptStability(systemPrompt);
}
