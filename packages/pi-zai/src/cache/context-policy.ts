import type { Model } from "@earendil-works/pi-ai";
import { canonicalizeStablePrefix } from "./fingerprint.ts";

const ZAI_PROVIDERS = new Set(["zai", "zai-coding-cn", "zai-platform"]);

export const DYNAMIC_CONTEXT_MARKER = "\n\n--- dynamic context ---\n";

export const DYNAMIC_CONTEXT_MARKERS = [
	"Current git status",
	"Current git diff",
	"Latest test failure",
	"Current timestamp",
	"Ephemeral diagnostics",
	"Context tokens:",
	"Token count:",
] as const;

const VOLATILE_LINE_PREFIXES = DYNAMIC_CONTEXT_MARKERS.map((marker) => marker.toLowerCase());

export function isZaiProvider(provider: string | undefined): boolean {
	return provider !== undefined && ZAI_PROVIDERS.has(provider);
}

export function isZaiModel(model: Model<any> | undefined): boolean {
	return model !== undefined && isZaiProvider(model.provider);
}

export function isCodingPlanProvider(provider: string): boolean {
	return provider === "zai" || provider === "zai-coding-cn";
}

export function isPlatformProvider(provider: string): boolean {
	return provider === "zai-platform";
}

/** Z.AI does not share implicit cache between Coding Plan and Platform endpoints. */
export function endpointsShareCache(endpointA: string, endpointB: string): boolean {
	return endpointA === endpointB;
}

export function isVolatileSystemPromptLine(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed) return false;
	const lower = trimmed.toLowerCase();
	return VOLATILE_LINE_PREFIXES.some((marker) => lower.startsWith(marker));
}

export function stripVolatileSystemPromptLines(systemPrompt: string): string {
	const lines = systemPrompt.split("\n");
	const stable = lines.filter((line) => !isVolatileSystemPromptLine(line));
	return stable.join("\n");
}

export function splitStableAndDynamicSystemPrompt(systemPrompt: string): {
	stable: string;
	dynamic: string;
} {
	const index = systemPrompt.indexOf(DYNAMIC_CONTEXT_MARKER);
	if (index < 0) {
		return { stable: systemPrompt, dynamic: "" };
	}
	return {
		stable: systemPrompt.slice(0, index),
		dynamic: systemPrompt.slice(index + DYNAMIC_CONTEXT_MARKER.length),
	};
}

export function appendDynamicContext(stablePrompt: string, dynamicContext: string): string {
	const trimmed = dynamicContext.trim();
	if (!trimmed) return stablePrompt;
	return `${stablePrompt}${DYNAMIC_CONTEXT_MARKER}${trimmed}`;
}

export type SystemPromptSectionKind = "stable" | "volatile";

export type SystemPromptSection = {
	kind: SystemPromptSectionKind;
	lineCount: number;
};

/** Classify prompt structure without logging or returning prompt content. */
export function analyzeSystemPromptSections(systemPrompt: string): {
	stableLineCount: number;
	volatileLineCount: number;
	hasDynamicMarker: boolean;
	sections: SystemPromptSection[];
} {
	const { stable, dynamic } = splitStableAndDynamicSystemPrompt(systemPrompt);
	const stableLines = stable.split("\n");
	let volatileLineCount = dynamic ? dynamic.split("\n").filter((line) => line.trim()).length : 0;
	let inlineVolatile = 0;

	for (const line of stableLines) {
		if (isVolatileSystemPromptLine(line)) {
			inlineVolatile += 1;
		}
	}

	volatileLineCount += inlineVolatile;
	const stableLineCount = Math.max(0, stableLines.length - inlineVolatile);
	const sections: SystemPromptSection[] = [{ kind: "stable", lineCount: stableLineCount }];
	if (volatileLineCount > 0) {
		sections.push({ kind: "volatile", lineCount: volatileLineCount });
	}

	return {
		stableLineCount,
		volatileLineCount,
		hasDynamicMarker: dynamic.length > 0,
		sections,
	};
}

/** Return canonical stable prefix for fingerprinting; never logs raw prompt text. */
export function canonicalStableSystemPrefix(systemPrompt: string): string {
	const { stable } = splitStableAndDynamicSystemPrompt(systemPrompt);
	return canonicalizeStablePrefix(stripVolatileSystemPromptLines(stable));
}
