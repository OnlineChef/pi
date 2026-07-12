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
		storage.close();
	});

	it("recreates an empty database after clear-all", () => {
		const storage = sqliteStorage();
		storage.recordAttempt(record());
		storage.clearAll();
		expect(storage.getStatus()).toMatchObject({ detailRows: 0, rollupRows: 0, benchmarkRows: 0 });
		storage.close();
	});
});
