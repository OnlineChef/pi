/**
 * Z.AI Coding Plan usage/quota monitor.
 *
 * Uses the (unofficial but stable) monitor endpoints consumed by Z.AI's own
 * coding plugins. Baseline Pi has no visibility into subscription quota; this
 * surfaces the 5-hour / weekly token windows and monthly MCP tool budget.
 */

export type QuotaLimitType = "TOKENS_LIMIT" | "TIME_LIMIT";

export interface QuotaUsageDetail {
	modelCode: string;
	usage: number;
}

export interface QuotaLimitEntry {
	type: QuotaLimitType;
	unit: number;
	number: number;
	percentage: number;
	nextResetTime?: number;
	usage?: number;
	currentValue?: number;
	remaining?: number;
	usageDetails?: QuotaUsageDetail[];
}

export interface QuotaLimitData {
	limits: QuotaLimitEntry[];
	level: string;
}

interface MonitorEnvelope<T> {
	code: number;
	msg: string;
	success: boolean;
	data: T;
}

export type QuotaFetchResult = { ok: true; data: QuotaLimitData } | { ok: false; error: string };

const UNIT_NAMES: Record<number, string> = { 3: "Hour", 5: "Month", 6: "Week" };
const LEVEL_LABELS: Record<string, string> = {
	lite: "Lite",
	standard: "Pro",
	pro: "Pro",
	max: "Max",
};

/** Derive the monitor base (scheme + host) from a model baseUrl. */
export function monitorBaseFromModelUrl(baseUrl: string): string | undefined {
	try {
		return new URL(baseUrl).origin;
	} catch {
		return undefined;
	}
}

export async function fetchQuotaLimit(
	monitorBase: string,
	apiKey: string,
	timeoutMs = 15_000,
): Promise<QuotaFetchResult> {
	const url = `${monitorBase}/api/monitor/usage/quota/limit`;
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Accept-Language": "en-US,en",
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!response.ok) {
			return { ok: false, error: `HTTP ${response.status} from ${url}` };
		}
		const body = (await response.json()) as MonitorEnvelope<QuotaLimitData>;
		if (!body?.success || !body.data || !Array.isArray(body.data.limits)) {
			return { ok: false, error: body?.msg ?? "Unexpected quota response shape" };
		}
		return { ok: true, data: body.data };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
	}
}

export function levelLabel(level: string): string {
	return LEVEL_LABELS[level.toLowerCase()] ?? level;
}

function windowLabel(entry: QuotaLimitEntry): string {
	const unit = UNIT_NAMES[entry.unit] ?? "Window";
	const plural = entry.number > 1 ? "s" : "";
	const scope = entry.type === "TIME_LIMIT" ? "MCP tools" : "tokens";
	return `${entry.number}-${unit}${plural} ${scope}`;
}

export function formatResetCountdown(nextResetTime: number | undefined, now = Date.now()): string {
	if (!nextResetTime) return "";
	const diffMs = nextResetTime - now;
	if (diffMs <= 0) return "reset soon";
	const mins = Math.floor(diffMs / 60_000);
	const hours = Math.floor(mins / 60);
	const days = Math.floor(hours / 24);
	if (mins < 60) return `reset in ${mins}m`;
	if (hours < 24) return `reset in ${hours}h ${mins % 60}m`;
	return `reset in ${days}d ${hours % 24}h`;
}

function bar(percentage: number, width = 20): string {
	const clamped = Math.max(0, Math.min(100, percentage));
	const filled = Math.round((clamped / 100) * width);
	return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

export function formatQuotaLimit(data: QuotaLimitData, now = Date.now()): string[] {
	const lines = [`Coding Plan quota (${levelLabel(data.level)})`];
	for (const entry of data.limits) {
		const label = windowLabel(entry).padEnd(20);
		const reset = formatResetCountdown(entry.nextResetTime, now);
		if (entry.type === "TIME_LIMIT") {
			const used = entry.currentValue ?? 0;
			const cap = entry.usage ?? 0;
			lines.push(`  ${label} ${used}/${cap} (${entry.percentage}%) ${bar(entry.percentage)} ${reset}`.trimEnd());
			if (entry.usageDetails?.length) {
				const detail = entry.usageDetails.map((d) => `${d.modelCode}: ${d.usage}`).join(" · ");
				lines.push(`    ${detail}`);
			}
		} else {
			lines.push(`  ${label} ${entry.percentage}% ${bar(entry.percentage)} ${reset}`.trimEnd());
		}
	}
	return lines;
}
