import type { BenchmarkRunManifest, BenchmarkRunRecord, BenchmarkRunReport } from "../benchmark/types.ts";

export type MetricsStorageKind = "off" | "memory" | "sqlite";
export type MetricsExportFormat = "json" | "csv";

export interface ProviderAttemptRecord {
	occurredAt: number;
	projectId?: string;
	sessionHash?: string;
	queryId?: string;
	requestId?: string;
	attempt: number;
	provider: string;
	model: string;
	endpointKind: string;
	thinkingLevel?: string;
	piVersion?: string;
	extensionVersion: string;
	systemFingerprint?: string;
	toolsetFingerprint?: string;
	payloadFingerprint?: string;
	inputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	outputTokens?: number;
	requestToHeadersMs?: number;
	requestToFirstDeltaMs?: number;
	totalMs?: number;
	httpStatus?: number;
	errorCategory?: string;
	estimatedApiCostMicrousd?: number;
}

export interface UsageFilter {
	projectId?: string;
	since?: number;
}

export interface UsageSummary {
	attempts: number;
	errors: number;
	inputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	outputTokens: number;
	estimatedApiCostMicrousd: number;
	cacheHitRatio: number;
	firstOccurredAt?: number;
	lastOccurredAt?: number;
}

export interface TransportSummary {
	attempts: number;
	errors: number;
	avgRequestToHeadersMs?: number;
	avgRequestToFirstDeltaMs?: number;
	avgTotalMs?: number;
	errorCategories: Record<string, number>;
}

export interface StorageStatus {
	kind: MetricsStorageKind;
	location?: string;
	databaseBytes?: number;
	detailRows: number;
	rollupRows: number;
	benchmarkRows: number;
	lastCleanupAt?: number;
	degraded: boolean;
}

export interface CleanupResult {
	attemptsDeleted: number;
	rollupsDeleted: number;
	benchmarksDeleted: number;
	ran: boolean;
}

export interface MetricsStorage {
	readonly kind: MetricsStorageKind;
	initialize(): void;
	recordAttempt(record: ProviderAttemptRecord): void;
	getUsageSummary(filter?: UsageFilter): UsageSummary;
	getTransportSummary(filter?: UsageFilter): TransportSummary;
	getStatus(): StorageStatus;
	runCleanup(now: number, force?: boolean): CleanupResult;
	clearProject(projectId: string): void;
	clearDetails(): void;
	clearBenchmarks(): void;
	startBenchmarkRun(manifest: BenchmarkRunManifest): void;
	completeBenchmarkRun(runId: string, report: BenchmarkRunReport): boolean;
	listBenchmarkRuns(): BenchmarkRunRecord[];
	getBenchmarkRun(runId: string): BenchmarkRunRecord | undefined;
	clearAll(): void;
	exportData(format: MetricsExportFormat, filter?: UsageFilter): string;
	vacuum(): void;
	close(): void;
}

export const EMPTY_USAGE_SUMMARY: UsageSummary = {
	attempts: 0,
	errors: 0,
	inputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	outputTokens: 0,
	estimatedApiCostMicrousd: 0,
	cacheHitRatio: 0,
};

export const EMPTY_TRANSPORT_SUMMARY: TransportSummary = {
	attempts: 0,
	errors: 0,
	errorCategories: {},
};

function averageLatency(values: readonly (number | undefined)[]): number | undefined {
	const samples = values.filter((value): value is number => value !== undefined && Number.isFinite(value));
	if (samples.length === 0) return undefined;
	return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
}

export function summarizeTransportFromAttempts(records: readonly ProviderAttemptRecord[]): TransportSummary {
	if (records.length === 0) return { ...EMPTY_TRANSPORT_SUMMARY };

	const usage = summarizeAttempts(records);
	const errorCategories: Record<string, number> = {};
	for (const record of records) {
		if (!record.errorCategory) continue;
		errorCategories[record.errorCategory] = (errorCategories[record.errorCategory] ?? 0) + 1;
	}

	return {
		attempts: usage.attempts,
		errors: usage.errors,
		avgRequestToHeadersMs: averageLatency(records.map((record) => record.requestToHeadersMs)),
		avgRequestToFirstDeltaMs: averageLatency(records.map((record) => record.requestToFirstDeltaMs)),
		avgTotalMs: averageLatency(records.map((record) => record.totalMs)),
		errorCategories,
	};
}

export function summarizeAttempts(records: readonly ProviderAttemptRecord[]): UsageSummary {
	if (records.length === 0) return { ...EMPTY_USAGE_SUMMARY };

	let errors = 0;
	let inputTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;
	let outputTokens = 0;
	let estimatedApiCostMicrousd = 0;
	let firstOccurredAt = Number.POSITIVE_INFINITY;
	let lastOccurredAt = 0;

	for (const record of records) {
		if (record.errorCategory || (record.httpStatus !== undefined && record.httpStatus >= 400)) errors += 1;
		inputTokens += record.inputTokens ?? 0;
		cacheReadTokens += record.cacheReadTokens ?? 0;
		cacheWriteTokens += record.cacheWriteTokens ?? 0;
		outputTokens += record.outputTokens ?? 0;
		estimatedApiCostMicrousd += record.estimatedApiCostMicrousd ?? 0;
		firstOccurredAt = Math.min(firstOccurredAt, record.occurredAt);
		lastOccurredAt = Math.max(lastOccurredAt, record.occurredAt);
	}

	const totalPrompt = inputTokens + cacheReadTokens + cacheWriteTokens;
	return {
		attempts: records.length,
		errors,
		inputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		outputTokens,
		estimatedApiCostMicrousd,
		cacheHitRatio: totalPrompt > 0 ? cacheReadTokens / totalPrompt : 0,
		firstOccurredAt,
		lastOccurredAt,
	};
}

const EXPORT_COLUMNS = [
	"occurredAt",
	"projectId",
	"sessionHash",
	"queryId",
	"requestId",
	"attempt",
	"provider",
	"model",
	"endpointKind",
	"thinkingLevel",
	"piVersion",
	"extensionVersion",
	"systemFingerprint",
	"toolsetFingerprint",
	"payloadFingerprint",
	"inputTokens",
	"cacheReadTokens",
	"cacheWriteTokens",
	"outputTokens",
	"requestToHeadersMs",
	"requestToFirstDeltaMs",
	"totalMs",
	"httpStatus",
	"errorCategory",
	"estimatedApiCostMicrousd",
] as const satisfies readonly (keyof ProviderAttemptRecord)[];

function csvCell(value: unknown): string {
	if (value === undefined || value === null) return "";
	const text = String(value);
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeAttempts(records: readonly ProviderAttemptRecord[], format: MetricsExportFormat): string {
	if (format === "json") {
		return `${JSON.stringify({ schema: 1, attempts: records }, null, 2)}\n`;
	}

	const lines = [EXPORT_COLUMNS.join(",")];
	for (const record of records) {
		lines.push(EXPORT_COLUMNS.map((column) => csvCell(record[column])).join(","));
	}
	return `${lines.join("\n")}\n`;
}
