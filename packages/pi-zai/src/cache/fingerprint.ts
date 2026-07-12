import { createHash } from "node:crypto";

export const SHORT_HASH_LENGTH = 16;

const TIMESTAMP_PATTERNS = [
	/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g,
	/\bCurrent time:.*$/gm,
	/\bLast updated:.*$/gm,
	/\bToken count: \d+\b/g,
	/\bContext tokens: \d+\b/g,
];

const GIT_STATUS_PATTERNS = [
	/^Current git status\b.*$/gm,
	/^## (?:modified|untracked|staged).*/gm,
	/^On branch .+$/gm,
	/^Changes (?:not staged|to be committed).*/gm,
];

export function shortenHash(hex: string, length = SHORT_HASH_LENGTH): string {
	return hex.slice(0, length);
}

export function hashCanonicalText(text: string): string {
	return shortenHash(createHash("sha256").update(text).digest("hex"));
}

/** Strip volatile lines and normalize whitespace before fingerprinting. */
export function canonicalizeStablePrefix(text: string): string {
	let normalized = text.replace(/\r\n/g, "\n").trim();
	for (const pattern of TIMESTAMP_PATTERNS) {
		normalized = normalized.replace(pattern, "");
	}
	for (const pattern of GIT_STATUS_PATTERNS) {
		normalized = normalized.replace(pattern, "");
	}
	return normalized.replace(/\n{2,}/g, "\n").trim();
}

export function fingerprintText(text: string): string {
	return hashCanonicalText(canonicalizeStablePrefix(text));
}

export function fingerprintSystemPrompt(systemPrompt: string): string {
	return fingerprintText(systemPrompt);
}

export type ToolFingerprintInput = {
	name: string;
	description?: string;
	parameters?: unknown;
};

export function canonicalizeTool(tool: ToolFingerprintInput): string {
	const params =
		tool.parameters && typeof tool.parameters === "object"
			? stableJson(tool.parameters)
			: String(tool.parameters ?? "");
	return `${tool.name}\n${tool.description ?? ""}\n${params}`;
}

export function fingerprintToolset(tools: ToolFingerprintInput[]): string {
	const canonical = tools
		.map(canonicalizeTool)
		.sort((a, b) => a.localeCompare(b))
		.join("\n---\n");
	return hashCanonicalText(canonical);
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableJson(item)).join(",")}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
	return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`).join(",")}}`;
}
