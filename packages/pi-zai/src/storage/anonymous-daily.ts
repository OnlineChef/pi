import type { AnonymousDailySummary, ProviderAttemptRecord } from "./types.ts";

export function utcDayFromMs(timestampMs: number): string {
	return new Date(timestampMs).toISOString().slice(0, 10);
}

export function endpointKindFromProvider(provider: string): string {
	if (provider === "zai-platform") return "platform";
	if (provider === "zai-coding-cn") return "coding-cn";
	if (provider === "zai") return "coding";
	return "unknown";
}

export function isAttemptError(record: ProviderAttemptRecord): boolean {
	return Boolean(record.errorCategory) || (record.httpStatus !== undefined && record.httpStatus >= 400);
}

export function summarizeAnonymousDaily(records: readonly ProviderAttemptRecord[]): AnonymousDailySummary {
	const byKey = new Map<
		string,
		{ provider: string; model: string; endpointKind: string; attempts: number; errors: number }
	>();
	const errorCategories: Record<string, number> = {};
	let errors = 0;
	let inputTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;
	let outputTokens = 0;

	for (const record of records) {
		const key = `${record.provider}\0${record.model}\0${record.endpointKind}`;
		const row = byKey.get(key) ?? {
			provider: record.provider,
			model: record.model,
			endpointKind: record.endpointKind,
			attempts: 0,
			errors: 0,
		};
		row.attempts += 1;
		if (isAttemptError(record)) {
			row.errors += 1;
			errors += 1;
		}
		byKey.set(key, row);
		if (record.errorCategory) {
			errorCategories[record.errorCategory] = (errorCategories[record.errorCategory] ?? 0) + 1;
		}
		inputTokens += record.inputTokens ?? 0;
		cacheReadTokens += record.cacheReadTokens ?? 0;
		cacheWriteTokens += record.cacheWriteTokens ?? 0;
		outputTokens += record.outputTokens ?? 0;
	}

	return {
		attempts: records.length,
		errors,
		inputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		outputTokens,
		byProviderModel: Array.from(byKey.values()).sort(
			(left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model),
		),
		errorCategories,
	};
}

export function mergeAnonymousDailySummaries(
	summaries: readonly AnonymousDailySummary[],
): AnonymousDailySummary | undefined {
	if (summaries.length === 0) return undefined;
	const byKey = new Map<
		string,
		{ provider: string; model: string; endpointKind: string; attempts: number; errors: number }
	>();
	const errorCategories: Record<string, number> = {};
	let attempts = 0;
	let errors = 0;
	let inputTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;
	let outputTokens = 0;

	for (const summary of summaries) {
		attempts += summary.attempts;
		errors += summary.errors;
		inputTokens += summary.inputTokens;
		cacheReadTokens += summary.cacheReadTokens;
		cacheWriteTokens += summary.cacheWriteTokens;
		outputTokens += summary.outputTokens;
		for (const row of summary.byProviderModel) {
			const key = `${row.provider}\0${row.model}\0${row.endpointKind}`;
			const existing = byKey.get(key) ?? { ...row, attempts: 0, errors: 0 };
			existing.attempts += row.attempts;
			existing.errors += row.errors;
			byKey.set(key, existing);
		}
		for (const [category, count] of Object.entries(summary.errorCategories)) {
			errorCategories[category] = (errorCategories[category] ?? 0) + count;
		}
	}

	return {
		attempts,
		errors,
		inputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		outputTokens,
		byProviderModel: Array.from(byKey.values()),
		errorCategories,
	};
}
