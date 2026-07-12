import type { TransportSummary, UsageSummary } from "../storage/types.ts";
import type { BenchmarkScenarioId, BenchmarkVariantId } from "./manifest.ts";

export type BenchmarkRunManifest = {
	schema: 1;
	runId: string;
	createdAt: number;
	variant: BenchmarkVariantId;
	scenario: BenchmarkScenarioId;
	extensionVersion: string;
	projectId: string;
	attemptsBaseline: number;
	sessionHash?: string;
	provider?: string;
	modelId?: string;
	settings: Record<string, unknown>;
};

export type BenchmarkGateCheck = {
	id: string;
	label: string;
	required: number;
	actual: number;
	passed: boolean;
};

export type BenchmarkRunReport = {
	schema: 1;
	completedAt: number;
	durationMs: number;
	turnsObserved: number;
	usage: UsageSummary;
	transport: TransportSummary;
	cache: {
		requestsInSegment: number;
		cacheHitRatio: number;
		segmentChanges: number;
	};
	gates: BenchmarkGateCheck[];
};

export type BenchmarkRunRecord = {
	runId: string;
	createdAt: number;
	completedAt?: number;
	variant: BenchmarkVariantId;
	scenario: BenchmarkScenarioId;
	manifest: BenchmarkRunManifest;
	report?: BenchmarkRunReport;
};
