import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "./memory.ts";
import { NodeSqliteStorage } from "./sqlite.ts";
import type { ProviderAttemptRecord } from "./types.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function record(overrides: Partial<ProviderAttemptRecord> = {}): ProviderAttemptRecord {
	return {
		occurredAt: Date.now(),
		projectId: "project-a",
		attempt: 1,
		provider: "zai",
		model: "glm-5.2",
		endpointKind: "coding",
		extensionVersion: "0.1.0",
		inputTokens: 100,
		cacheReadTokens: 900,
		cacheWriteTokens: 0,
		outputTokens: 50,
		estimatedApiCostMicrousd: 1234,
		...overrides,
	};
}

function sqliteStorage(overrides: Partial<ConstructorParameters<typeof NodeSqliteStorage>[0]> = {}): NodeSqliteStorage {
	const directory = mkdtempSync(join(tmpdir(), "pi-zai-storage-"));
	temporaryDirectories.push(directory);
	const storage = new NodeSqliteStorage({
		databasePath: join(directory, "metrics.sqlite3"),
		retentionDays: 30,
		rollupRetentionDays: 180,
		maxDatabaseBytes: 32 * 1024 * 1024,
		...overrides,
	});
	storage.initialize();
	return storage;
}

describe("MemoryStorage", () => {
	it("summarizes privacy-reduced attempts and filters by project", () => {
		const storage = new MemoryStorage();
		storage.recordAttempt(record());
		storage.recordAttempt(record({ projectId: "project-b", inputTokens: 50, cacheReadTokens: 50 }));

		expect(storage.getUsageSummary({ projectId: "project-a" })).toMatchObject({
			attempts: 1,
			inputTokens: 100,
			cacheReadTokens: 900,
			cacheHitRatio: 0.9,
		});
	});

	it("does not record when metrics are off", () => {
		const storage = new MemoryStorage({ enabled: false });
		storage.recordAttempt(record());
		expect(storage.getStatus()).toMatchObject({ kind: "off", detailRows: 0 });
	});

	it("summarizes transport latency and error categories", () => {
		const storage = new MemoryStorage();
		storage.recordAttempt(
			record({
				requestToHeadersMs: 100,
				requestToFirstDeltaMs: 200,
				totalMs: 500,
			}),
		);
		storage.recordAttempt(
			record({
				errorCategory: "timeout_before_headers",
				httpStatus: 504,
				requestToHeadersMs: 300,
			}),
		);

		expect(storage.getTransportSummary({ projectId: "project-a" })).toMatchObject({
			attempts: 2,
			errors: 1,
			avgRequestToHeadersMs: 200,
			errorCategories: { timeout_before_headers: 1 },
		});
	});

	it("filters usage and transport summaries by project and since", () => {
		const storage = new MemoryStorage();
		const baseline = Date.now();
		storage.recordAttempt(record({ occurredAt: baseline - 1_000 }));
		storage.recordAttempt(record({ occurredAt: baseline + 1_000, inputTokens: 50 }));

		expect(storage.getUsageSummary({ projectId: "project-a", since: baseline })).toMatchObject({
			attempts: 1,
			inputTokens: 50,
		});
		expect(storage.getTransportSummary({ projectId: "project-a", since: baseline })).toMatchObject({
			attempts: 1,
		});
	});
});

describe("NodeSqliteStorage", () => {
	it("records, queries, exports, and clears project metrics", () => {
		const storage = sqliteStorage();
		storage.recordAttempt(record());
		storage.recordAttempt(record({ projectId: "project-b" }));

		expect(storage.getUsageSummary({ projectId: "project-a" })).toMatchObject({
			attempts: 1,
			inputTokens: 100,
			cacheReadTokens: 900,
		});
		expect(storage.exportData("json", { projectId: "project-a" })).not.toContain("project-b");
		expect(storage.exportData("csv", { projectId: "project-a" })).toContain("cacheReadTokens");

		storage.clearProject("project-a");
		expect(storage.getUsageSummary({ projectId: "project-a" }).attempts).toBe(0);
		storage.close();
	});

	it("rolls expired details into daily summaries before deletion", () => {
		const now = Date.now();
		const storage = sqliteStorage();
		storage.recordAttempt(record({ occurredAt: now - 40 * 86_400_000 }));

		const result = storage.runCleanup(now, true);
		expect(result.attemptsDeleted).toBe(1);
		expect(storage.getStatus()).toMatchObject({ detailRows: 0, rollupRows: 1 });
		expect(storage.getUsageSummary({ projectId: "project-a" })).toMatchObject({
			attempts: 1,
			inputTokens: 100,
			cacheReadTokens: 900,
		});
		expect(storage.getTransportSummary({ projectId: "project-a" })).toMatchObject({
			attempts: 1,
			errors: 0,
		});
		storage.close();
	});

	it("recreates an empty database after clear-all", () => {
		const storage = sqliteStorage();
		storage.recordAttempt(record());
		storage.clearAll();
		expect(storage.getStatus()).toMatchObject({ detailRows: 0, rollupRows: 0, benchmarkRows: 0 });
		storage.close();
	});

	it("records and completes benchmark runs", () => {
		const storage = sqliteStorage();
		const manifest = {
			schema: 1 as const,
			runId: "bench-1",
			createdAt: Date.now(),
			variant: "A1" as const,
			scenario: "stable-conversation" as const,
			extensionVersion: "0.1.1",
			projectId: "project-a",
			attemptsBaseline: 0,
			settings: {},
		};
		storage.startBenchmarkRun(manifest);
		expect(storage.getStatus().benchmarkRows).toBe(1);

		const completed = storage.completeBenchmarkRun("bench-1", {
			schema: 1,
			completedAt: Date.now(),
			durationMs: 1000,
			turnsObserved: 1,
			usage: storage.getUsageSummary({ projectId: "project-a" }),
			transport: storage.getTransportSummary({ projectId: "project-a" }),
			cache: { requestsInSegment: 0, cacheHitRatio: 0, segmentChanges: 0 },
			gates: [],
		});
		expect(completed).toBe(true);
		expect(storage.getBenchmarkRun("bench-1")?.report?.turnsObserved).toBe(1);
		storage.close();
	});
});
