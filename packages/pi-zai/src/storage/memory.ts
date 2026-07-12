import type { BenchmarkRunManifest, BenchmarkRunRecord, BenchmarkRunReport } from "../benchmark/types.ts";
import {
	type CleanupResult,
	EMPTY_TRANSPORT_SUMMARY,
	EMPTY_USAGE_SUMMARY,
	type MetricsExportFormat,
	type MetricsStorage,
	type MetricsStorageKind,
	type ProviderAttemptRecord,
	type StorageStatus,
	serializeAttempts,
	summarizeAttempts,
	summarizeTransportFromAttempts,
	type TransportSummary,
	type UsageFilter,
	type UsageSummary,
} from "./types.ts";

export interface MemoryStorageOptions {
	enabled?: boolean;
	retentionDays?: number;
}

export class MemoryStorage implements MetricsStorage {
	readonly kind: MetricsStorageKind;
	private readonly enabled: boolean;
	private readonly retentionDays: number;
	private records: ProviderAttemptRecord[] = [];
	private benchmarkRuns: BenchmarkRunRecord[] = [];

	constructor(options: MemoryStorageOptions = {}) {
		this.enabled = options.enabled ?? true;
		this.kind = this.enabled ? "memory" : "off";
		this.retentionDays = options.retentionDays ?? 30;
	}

	initialize(): void {}

	recordAttempt(record: ProviderAttemptRecord): void {
		if (!this.enabled) return;
		this.records.push({ ...record });
	}

	getUsageSummary(filter: UsageFilter = {}): UsageSummary {
		if (!this.enabled) return { ...EMPTY_USAGE_SUMMARY };
		return summarizeAttempts(this.filtered(filter));
	}

	getTransportSummary(filter: UsageFilter = {}): TransportSummary {
		if (!this.enabled) return { ...EMPTY_TRANSPORT_SUMMARY };
		return summarizeTransportFromAttempts(this.filtered(filter));
	}

	getStatus(): StorageStatus {
		return {
			kind: this.kind,
			detailRows: this.enabled ? this.records.length : 0,
			rollupRows: 0,
			benchmarkRows: this.enabled ? this.benchmarkRuns.length : 0,
			degraded: false,
		};
	}

	runCleanup(now: number, force = false): CleanupResult {
		if (!this.enabled) return { attemptsDeleted: 0, rollupsDeleted: 0, benchmarksDeleted: 0, ran: false };
		const cutoff = now - this.retentionDays * 86_400_000;
		const before = this.records.length;
		this.records = this.records.filter((record) => record.occurredAt >= cutoff);
		return {
			attemptsDeleted: before - this.records.length,
			rollupsDeleted: 0,
			benchmarksDeleted: 0,
			ran: force || before !== this.records.length,
		};
	}

	clearProject(projectId: string): void {
		if (!this.enabled) return;
		this.records = this.records.filter((record) => record.projectId !== projectId);
	}

	clearDetails(): void {
		this.records = [];
	}

	clearBenchmarks(): void {
		this.benchmarkRuns = [];
	}

	startBenchmarkRun(manifest: BenchmarkRunManifest): void {
		if (!this.enabled) return;
		this.benchmarkRuns.push({
			runId: manifest.runId,
			createdAt: manifest.createdAt,
			variant: manifest.variant,
			scenario: manifest.scenario,
			manifest,
		});
	}

	completeBenchmarkRun(runId: string, report: BenchmarkRunReport): boolean {
		if (!this.enabled) return false;
		const run = this.benchmarkRuns.find((entry) => entry.runId === runId);
		if (!run) return false;
		run.completedAt = report.completedAt;
		run.report = report;
		return true;
	}

	listBenchmarkRuns(): BenchmarkRunRecord[] {
		return this.enabled ? this.benchmarkRuns.map((entry) => ({ ...entry, manifest: { ...entry.manifest } })) : [];
	}

	getBenchmarkRun(runId: string): BenchmarkRunRecord | undefined {
		const run = this.benchmarkRuns.find((entry) => entry.runId === runId);
		return run
			? { ...run, manifest: { ...run.manifest }, report: run.report ? { ...run.report } : undefined }
			: undefined;
	}

	clearAll(): void {
		this.records = [];
		this.benchmarkRuns = [];
	}

	exportData(format: MetricsExportFormat, filter: UsageFilter = {}): string {
		return serializeAttempts(this.enabled ? this.filtered(filter) : [], format);
	}

	vacuum(): void {}

	close(): void {}

	private filtered(filter: UsageFilter): ProviderAttemptRecord[] {
		return this.records.filter((record) => {
			if (filter.projectId !== undefined && record.projectId !== filter.projectId) return false;
			if (filter.since !== undefined && record.occurredAt < filter.since) return false;
			return true;
		});
	}
}
