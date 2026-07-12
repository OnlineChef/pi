import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { MemoryStorage } from "./memory.ts";
import { INITIAL_SCHEMA_SQL, SCHEMA_VERSION } from "./migrations.ts";
import {
	type CleanupResult,
	type MetricsExportFormat,
	type MetricsStorage,
	type ProviderAttemptRecord,
	type StorageStatus,
	serializeAttempts,
	type TransportSummary,
	type UsageFilter,
	type UsageSummary,
} from "./types.ts";

export interface NodeSqliteStorageOptions {
	databasePath: string;
	retentionDays: number;
	rollupRetentionDays: number;
	maxDatabaseBytes: number;
	onWarning?: (message: string) => void;
}

type SqlRow = Record<string, unknown>;

const INSERT_ATTEMPT_SQL = `
INSERT INTO provider_attempts (
  occurred_at, project_id, session_hash, query_id, request_id, attempt,
  provider, model, endpoint_kind, thinking_level, pi_version, extension_version,
  system_fingerprint, toolset_fingerprint, payload_fingerprint,
  input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
  request_to_headers_ms, request_to_first_delta_ms, total_ms,
  http_status, error_category, estimated_api_cost_microusd
) VALUES (
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?
)`;

export class NodeSqliteStorage implements MetricsStorage {
	readonly kind = "sqlite" as const;
	private readonly options: NodeSqliteStorageOptions;
	private readonly fallback: MemoryStorage;
	private database: DatabaseSync | undefined;
	private insertAttempt: StatementSync | undefined;
	private warned = false;
	private degraded = false;

	constructor(options: NodeSqliteStorageOptions) {
		this.options = options;
		this.fallback = new MemoryStorage({ retentionDays: options.retentionDays });
	}

	initialize(): void {
		mkdirSync(dirname(this.options.databasePath), { recursive: true });
		const database = new DatabaseSync(this.options.databasePath);
		this.database = database;
		database.exec("PRAGMA journal_mode = WAL;");
		database.exec("PRAGMA synchronous = NORMAL;");
		database.exec("PRAGMA foreign_keys = ON;");
		database.exec("PRAGMA temp_store = MEMORY;");
		database.exec("PRAGMA auto_vacuum = INCREMENTAL;");
		database.exec("PRAGMA busy_timeout = 25;");
		database.exec(INITIAL_SCHEMA_SQL);
		database
			.prepare(
				"INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.run(String(SCHEMA_VERSION));
		database
			.prepare("INSERT INTO schema_meta(key, value) VALUES ('created_at', ?) ON CONFLICT(key) DO NOTHING")
			.run(String(Date.now()));
		this.insertAttempt = database.prepare(INSERT_ATTEMPT_SQL);
	}

	recordAttempt(record: ProviderAttemptRecord): void {
		this.fallback.recordAttempt(record);
		if (!this.database || !this.insertAttempt) return;
		try {
			this.insertAttempt.run(
				record.occurredAt,
				record.projectId ?? null,
				record.sessionHash ?? null,
				record.queryId ?? null,
				record.requestId ?? null,
				record.attempt,
				record.provider,
				record.model,
				record.endpointKind,
				record.thinkingLevel ?? null,
				record.piVersion ?? null,
				record.extensionVersion,
				record.systemFingerprint ?? null,
				record.toolsetFingerprint ?? null,
				record.payloadFingerprint ?? null,
				record.inputTokens ?? null,
				record.cacheReadTokens ?? null,
				record.cacheWriteTokens ?? null,
				record.outputTokens ?? null,
				record.requestToHeadersMs ?? null,
				record.requestToFirstDeltaMs ?? null,
				record.totalMs ?? null,
				record.httpStatus ?? null,
				record.errorCategory ?? null,
				record.estimatedApiCostMicrousd ?? null,
			);
		} catch (error) {
			this.degrade(error);
		}
	}

	getUsageSummary(filter: UsageFilter = {}): UsageSummary {
		if (!this.database) return this.fallback.getUsageSummary(filter);
		try {
			const detailQuery = buildWhere(filter);
			const detail = this.database
				.prepare(`
SELECT
  COUNT(*) AS attempts,
  COALESCE(SUM(CASE WHEN error_category IS NOT NULL OR http_status >= 400 THEN 1 ELSE 0 END), 0) AS errors,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(estimated_api_cost_microusd), 0) AS estimated_api_cost_microusd,
  MIN(occurred_at) AS first_occurred_at,
  MAX(occurred_at) AS last_occurred_at
FROM provider_attempts${detailQuery.where}`)
				.get(...detailQuery.values) as SqlRow;
			const rollupQuery = buildRollupWhere(filter);
			const rollup = this.database
				.prepare(`
SELECT
  COALESCE(SUM(attempt_count), 0) AS attempts,
  COALESCE(SUM(error_count), 0) AS errors,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(estimated_api_cost_microusd), 0) AS estimated_api_cost_microusd,
  MIN(day) AS first_day,
  MAX(day) AS last_day
FROM daily_rollups${rollupQuery.where}`)
				.get(...rollupQuery.values) as SqlRow;

			const inputTokens = numberValue(detail.input_tokens) + numberValue(rollup.input_tokens);
			const cacheReadTokens = numberValue(detail.cache_read_tokens) + numberValue(rollup.cache_read_tokens);
			const cacheWriteTokens = numberValue(detail.cache_write_tokens) + numberValue(rollup.cache_write_tokens);
			const totalPrompt = inputTokens + cacheReadTokens + cacheWriteTokens;
			return {
				attempts: numberValue(detail.attempts) + numberValue(rollup.attempts),
				errors: numberValue(detail.errors) + numberValue(rollup.errors),
				inputTokens,
				cacheReadTokens,
				cacheWriteTokens,
				outputTokens: numberValue(detail.output_tokens) + numberValue(rollup.output_tokens),
				estimatedApiCostMicrousd:
					numberValue(detail.estimated_api_cost_microusd) + numberValue(rollup.estimated_api_cost_microusd),
				cacheHitRatio: totalPrompt > 0 ? cacheReadTokens / totalPrompt : 0,
				firstOccurredAt: earliestTimestamp(
					optionalNumber(detail.first_occurred_at),
					dayToTimestamp(optionalString(rollup.first_day)),
				),
				lastOccurredAt: latestTimestamp(
					optionalNumber(detail.last_occurred_at),
					dayToTimestamp(optionalString(rollup.last_day)),
				),
			};
		} catch (error) {
			this.degrade(error);
			return this.fallback.getUsageSummary(filter);
		}
	}

	getTransportSummary(filter: UsageFilter = {}): TransportSummary {
		if (!this.database) return this.fallback.getTransportSummary(filter);
		try {
			const detailQuery = buildWhere(filter);
			const row = this.database
				.prepare(`
SELECT
  COUNT(*) AS attempts,
  COALESCE(SUM(CASE WHEN error_category IS NOT NULL OR http_status >= 400 THEN 1 ELSE 0 END), 0) AS errors,
  AVG(request_to_headers_ms) AS avg_request_to_headers_ms,
  AVG(request_to_first_delta_ms) AS avg_request_to_first_delta_ms,
  AVG(total_ms) AS avg_total_ms
FROM provider_attempts${detailQuery.where}`)
				.get(...detailQuery.values) as SqlRow;
			const categoryQuery = buildErrorCategoryWhere(filter);
			const categoryRows = this.database
				.prepare(`
SELECT error_category, COUNT(*) AS count
FROM provider_attempts${categoryQuery.where}
GROUP BY error_category`)
				.all(...categoryQuery.values) as SqlRow[];
			const errorCategories: Record<string, number> = {};
			for (const categoryRow of categoryRows) {
				const category = optionalString(categoryRow.error_category);
				if (!category) continue;
				errorCategories[category] = numberValue(categoryRow.count);
			}
			return {
				attempts: numberValue(row.attempts),
				errors: numberValue(row.errors),
				avgRequestToHeadersMs: roundOptionalAverage(row.avg_request_to_headers_ms),
				avgRequestToFirstDeltaMs: roundOptionalAverage(row.avg_request_to_first_delta_ms),
				avgTotalMs: roundOptionalAverage(row.avg_total_ms),
				errorCategories,
			};
		} catch (error) {
			this.degrade(error);
			return this.fallback.getTransportSummary(filter);
		}
	}

	getStatus(): StorageStatus {
		if (!this.database) {
			const fallback = this.fallback.getStatus();
			return { ...fallback, kind: "sqlite", location: this.options.databasePath, degraded: true };
		}
		try {
			const detailRows = count(this.database, "provider_attempts");
			const rollupRows = count(this.database, "daily_rollups");
			const benchmarkRows = count(this.database, "benchmark_runs");
			const lastCleanup = this.database
				.prepare("SELECT value FROM schema_meta WHERE key = 'last_cleanup_at'")
				.get() as SqlRow | undefined;
			return {
				kind: "sqlite",
				location: this.options.databasePath,
				databaseBytes: databaseFootprint(this.options.databasePath),
				detailRows,
				rollupRows,
				benchmarkRows,
				lastCleanupAt: lastCleanup ? optionalNumber(lastCleanup.value) : undefined,
				degraded: this.degraded,
			};
		} catch (error) {
			this.degrade(error);
			const fallback = this.fallback.getStatus();
			return { ...fallback, kind: "sqlite", location: this.options.databasePath, degraded: true };
		}
	}

	runCleanup(now: number, force = false): CleanupResult {
		if (!this.database) return this.fallback.runCleanup(now, force);
		try {
			const lastCleanupRow = this.database
				.prepare("SELECT value FROM schema_meta WHERE key = 'last_cleanup_at'")
				.get() as SqlRow | undefined;
			const lastCleanupAt = lastCleanupRow ? numberValue(lastCleanupRow.value) : 0;
			if (!force && sameUtcDay(lastCleanupAt, now)) {
				return { attemptsDeleted: 0, rollupsDeleted: 0, benchmarksDeleted: 0, ran: false };
			}

			const detailsCutoff = now - this.options.retentionDays * 86_400_000;
			const rollupCutoffDay = new Date(now - this.options.rollupRetentionDays * 86_400_000)
				.toISOString()
				.slice(0, 10);
			const abandonedBenchmarkCutoff = now - 7 * 86_400_000;
			this.database.exec("BEGIN IMMEDIATE;");
			let attemptsDeleted = 0;
			let rollupsDeleted = 0;
			let benchmarksDeleted = 0;
			try {
				this.database
					.prepare(`
INSERT INTO daily_rollups (
  day, project_id, provider, model, extension_version,
  turn_count, attempt_count, error_count,
  input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
  estimated_api_cost_microusd
)
SELECT
  strftime('%Y-%m-%d', occurred_at / 1000, 'unixepoch'),
  project_id, provider, model, extension_version,
  COUNT(*), COUNT(*),
  SUM(CASE WHEN error_category IS NOT NULL OR http_status >= 400 THEN 1 ELSE 0 END),
  COALESCE(SUM(input_tokens), 0), COALESCE(SUM(cache_read_tokens), 0),
  COALESCE(SUM(cache_write_tokens), 0), COALESCE(SUM(output_tokens), 0),
  COALESCE(SUM(estimated_api_cost_microusd), 0)
FROM provider_attempts
WHERE occurred_at < ?
GROUP BY 1, project_id, provider, model, extension_version
ON CONFLICT(day, project_id, provider, model, extension_version) DO UPDATE SET
  turn_count = excluded.turn_count,
  attempt_count = excluded.attempt_count,
  error_count = excluded.error_count,
  input_tokens = excluded.input_tokens,
  cache_read_tokens = excluded.cache_read_tokens,
  cache_write_tokens = excluded.cache_write_tokens,
  output_tokens = excluded.output_tokens,
  estimated_api_cost_microusd = excluded.estimated_api_cost_microusd`)
					.run(detailsCutoff);
				attemptsDeleted = Number(
					this.database.prepare("DELETE FROM provider_attempts WHERE occurred_at < ?").run(detailsCutoff).changes,
				);
				rollupsDeleted = Number(
					this.database.prepare("DELETE FROM daily_rollups WHERE day < ?").run(rollupCutoffDay).changes,
				);
				benchmarksDeleted = Number(
					this.database
						.prepare("DELETE FROM benchmark_runs WHERE completed_at IS NULL AND created_at < ?")
						.run(abandonedBenchmarkCutoff).changes,
				);
				this.database
					.prepare(
						"INSERT INTO schema_meta(key, value) VALUES ('last_cleanup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
					)
					.run(String(now));
				this.database.exec("COMMIT;");
			} catch (error) {
				this.database.exec("ROLLBACK;");
				throw error;
			}

			this.enforceSizeLimit(now);
			this.database.exec("PRAGMA incremental_vacuum;");
			return { attemptsDeleted, rollupsDeleted, benchmarksDeleted, ran: true };
		} catch (error) {
			this.degrade(error);
			return this.fallback.runCleanup(now, force);
		}
	}

	clearProject(projectId: string): void {
		this.executeOrDegrade(() => {
			this.database?.prepare("DELETE FROM provider_attempts WHERE project_id = ?").run(projectId);
			this.database?.prepare("DELETE FROM daily_rollups WHERE project_id = ?").run(projectId);
		});
		this.fallback.clearProject(projectId);
	}

	clearDetails(): void {
		this.executeOrDegrade(() => this.database?.exec("DELETE FROM provider_attempts;"));
		this.fallback.clearDetails();
	}

	clearBenchmarks(): void {
		this.executeOrDegrade(() => this.database?.exec("DELETE FROM benchmark_runs;"));
		this.fallback.clearBenchmarks();
	}

	clearAll(): void {
		this.close();
		for (const path of [
			this.options.databasePath,
			`${this.options.databasePath}-wal`,
			`${this.options.databasePath}-shm`,
		]) {
			if (existsSync(path)) rmSync(path, { force: true });
		}
		this.degraded = false;
		this.warned = false;
		this.fallback.clearAll();
		this.initialize();
	}

	exportData(format: MetricsExportFormat, filter: UsageFilter = {}): string {
		if (!this.database) return this.fallback.exportData(format, filter);
		try {
			const { where, values } = buildWhere(filter);
			const rows = this.database
				.prepare(`SELECT
  occurred_at, project_id, session_hash, query_id, request_id, attempt,
  provider, model, endpoint_kind, thinking_level, pi_version, extension_version,
  system_fingerprint, toolset_fingerprint, payload_fingerprint,
  input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
  request_to_headers_ms, request_to_first_delta_ms, total_ms,
  http_status, error_category, estimated_api_cost_microusd
FROM provider_attempts${where}
ORDER BY occurred_at ASC, id ASC`)
				.all(...values) as SqlRow[];
			return serializeAttempts(rows.map(rowToRecord), format);
		} catch (error) {
			this.degrade(error);
			return this.fallback.exportData(format, filter);
		}
	}

	vacuum(): void {
		this.executeOrDegrade(() => {
			this.database?.exec("PRAGMA wal_checkpoint(TRUNCATE);");
			this.database?.exec("VACUUM;");
		});
	}

	close(): void {
		try {
			this.database?.exec("PRAGMA wal_checkpoint(PASSIVE);");
			this.database?.close();
		} finally {
			this.database = undefined;
			this.insertAttempt = undefined;
		}
	}

	private executeOrDegrade(action: () => void): void {
		if (!this.database) return;
		try {
			action();
		} catch (error) {
			this.degrade(error);
		}
	}

	private enforceSizeLimit(now: number): void {
		if (!this.database || databaseFootprint(this.options.databasePath) <= this.options.maxDatabaseBytes) return;
		const preserveSince = now - 7 * 86_400_000;
		for (
			let batch = 0;
			batch < 20 && databaseFootprint(this.options.databasePath) > this.options.maxDatabaseBytes;
			batch += 1
		) {
			const result = this.database
				.prepare(
					"DELETE FROM provider_attempts WHERE id IN (SELECT id FROM provider_attempts WHERE occurred_at < ? ORDER BY occurred_at ASC LIMIT 500)",
				)
				.run(preserveSince);
			if (Number(result.changes) === 0) break;
			this.database.exec("PRAGMA incremental_vacuum;");
		}
	}

	private degrade(error: unknown): void {
		this.degraded = true;
		try {
			this.database?.close();
		} catch {}
		this.database = undefined;
		this.insertAttempt = undefined;
		if (!this.warned) {
			this.warned = true;
			const detail = error instanceof Error ? error.message : String(error);
			this.options.onWarning?.(`pi-zai SQLite disabled for this session; using memory-only metrics (${detail}).`);
		}
	}
}

function buildErrorCategoryWhere(filter: UsageFilter): { where: string; values: Array<string | number> } {
	const base = buildWhere(filter);
	const clause = "error_category IS NOT NULL";
	return base.where.length > 0
		? { where: `${base.where} AND ${clause}`, values: base.values }
		: { where: ` WHERE ${clause}`, values: base.values };
}

function roundOptionalAverage(value: unknown): number | undefined {
	if (value === null || value === undefined) return undefined;
	const average = numberValue(value);
	return Number.isFinite(average) ? Math.round(average) : undefined;
}

function buildWhere(filter: UsageFilter): { where: string; values: Array<string | number> } {
	const clauses: string[] = [];
	const values: Array<string | number> = [];
	if (filter.projectId !== undefined) {
		clauses.push("project_id = ?");
		values.push(filter.projectId);
	}
	if (filter.since !== undefined) {
		clauses.push("occurred_at >= ?");
		values.push(filter.since);
	}
	return { where: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "", values };
}

function buildRollupWhere(filter: UsageFilter): { where: string; values: string[] } {
	const clauses: string[] = [];
	const values: string[] = [];
	if (filter.projectId !== undefined) {
		clauses.push("project_id = ?");
		values.push(filter.projectId);
	}
	if (filter.since !== undefined) {
		clauses.push("day >= ?");
		values.push(new Date(filter.since).toISOString().slice(0, 10));
	}
	return { where: clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "", values };
}

function rowToRecord(row: SqlRow): ProviderAttemptRecord {
	return {
		occurredAt: numberValue(row.occurred_at),
		projectId: optionalString(row.project_id),
		sessionHash: optionalString(row.session_hash),
		queryId: optionalString(row.query_id),
		requestId: optionalString(row.request_id),
		attempt: numberValue(row.attempt),
		provider: String(row.provider),
		model: String(row.model),
		endpointKind: String(row.endpoint_kind),
		thinkingLevel: optionalString(row.thinking_level),
		piVersion: optionalString(row.pi_version),
		extensionVersion: String(row.extension_version),
		systemFingerprint: optionalString(row.system_fingerprint),
		toolsetFingerprint: optionalString(row.toolset_fingerprint),
		payloadFingerprint: optionalString(row.payload_fingerprint),
		inputTokens: optionalNumber(row.input_tokens),
		cacheReadTokens: optionalNumber(row.cache_read_tokens),
		cacheWriteTokens: optionalNumber(row.cache_write_tokens),
		outputTokens: optionalNumber(row.output_tokens),
		requestToHeadersMs: optionalNumber(row.request_to_headers_ms),
		requestToFirstDeltaMs: optionalNumber(row.request_to_first_delta_ms),
		totalMs: optionalNumber(row.total_ms),
		httpStatus: optionalNumber(row.http_status),
		errorCategory: optionalString(row.error_category),
		estimatedApiCostMicrousd: optionalNumber(row.estimated_api_cost_microusd),
	};
}

function count(database: DatabaseSync, table: "provider_attempts" | "daily_rollups" | "benchmark_runs"): number {
	const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as SqlRow;
	return numberValue(row.count);
}

function numberValue(value: unknown): number {
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "number") return value;
	if (typeof value === "string" && value !== "") return Number(value);
	return 0;
}

function optionalNumber(value: unknown): number | undefined {
	if (value === null || value === undefined) return undefined;
	return numberValue(value);
}

function optionalString(value: unknown): string | undefined {
	return value === null || value === undefined ? undefined : String(value);
}

function dayToTimestamp(day: string | undefined): number | undefined {
	if (!day) return undefined;
	const value = Date.parse(`${day}T00:00:00.000Z`);
	return Number.isFinite(value) ? value : undefined;
}

function earliestTimestamp(left: number | undefined, right: number | undefined): number | undefined {
	if (left === undefined) return right;
	if (right === undefined) return left;
	return Math.min(left, right);
}

function latestTimestamp(left: number | undefined, right: number | undefined): number | undefined {
	if (left === undefined) return right;
	if (right === undefined) return left;
	return Math.max(left, right);
}

function fileSize(path: string): number {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}

function databaseFootprint(path: string): number {
	return fileSize(path) + fileSize(`${path}-wal`) + fileSize(`${path}-shm`);
}

function sameUtcDay(left: number, right: number): boolean {
	if (left <= 0 || right <= 0) return false;
	return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}
