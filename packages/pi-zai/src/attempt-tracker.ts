import type { Usage } from "@earendil-works/pi-ai";
import type { ProviderAttemptRecord } from "./storage/types.ts";

type InFlightAttempt = {
	queryId: string;
	requestId: string;
	attempt: number;
	payloadFingerprint: string;
	requestStartedAt: number;
	headersReceivedAt: number | undefined;
	firstDeltaAt: number | undefined;
	httpStatus: number | undefined;
	errorCategory: string | undefined;
};

export class AttemptTracker {
	private inFlight: InFlightAttempt | undefined;

	beginAttempt(input: {
		queryId: string;
		requestId: string;
		attempt: number;
		payloadFingerprint: string;
		now?: number;
	}): void {
		this.inFlight = {
			queryId: input.queryId,
			requestId: input.requestId,
			attempt: input.attempt,
			payloadFingerprint: input.payloadFingerprint,
			requestStartedAt: input.now ?? Date.now(),
			headersReceivedAt: undefined,
			firstDeltaAt: undefined,
			httpStatus: undefined,
			errorCategory: undefined,
		};
	}

	markHeadersReceived(now = Date.now()): void {
		if (!this.inFlight || this.inFlight.headersReceivedAt !== undefined) return;
		this.inFlight.headersReceivedAt = now;
	}

	markFirstDelta(now = Date.now()): void {
		if (!this.inFlight || this.inFlight.firstDeltaAt !== undefined) return;
		this.inFlight.firstDeltaAt = now;
	}

	markResponse(status: number, errorCategory?: string): void {
		if (!this.inFlight) return;
		this.inFlight.httpStatus = status;
		if (errorCategory) {
			this.inFlight.errorCategory = errorCategory;
		}
		if (this.inFlight.headersReceivedAt === undefined) {
			this.inFlight.headersReceivedAt = Date.now();
		}
	}

	buildRecord(input: {
		occurredAt?: number;
		projectId: string;
		sessionHash: string;
		provider: string;
		model: string;
		endpointKind: string;
		thinkingLevel?: string;
		extensionVersion: string;
		systemFingerprint?: string;
		toolsetFingerprint?: string;
		usage?: Usage;
		errorCategory?: string;
	}): ProviderAttemptRecord | undefined {
		if (!this.inFlight) return undefined;

		const endedAt = input.occurredAt ?? Date.now();
		const requestToHeadersMs =
			this.inFlight.headersReceivedAt !== undefined
				? this.inFlight.headersReceivedAt - this.inFlight.requestStartedAt
				: undefined;
		const requestToFirstDeltaMs =
			this.inFlight.firstDeltaAt !== undefined
				? this.inFlight.firstDeltaAt - this.inFlight.requestStartedAt
				: undefined;
		const totalMs = endedAt - this.inFlight.requestStartedAt;

		const record: ProviderAttemptRecord = {
			occurredAt: endedAt,
			projectId: input.projectId,
			sessionHash: input.sessionHash,
			queryId: this.inFlight.queryId,
			requestId: this.inFlight.requestId,
			attempt: this.inFlight.attempt,
			provider: input.provider,
			model: input.model,
			endpointKind: input.endpointKind,
			thinkingLevel: input.thinkingLevel,
			extensionVersion: input.extensionVersion,
			systemFingerprint: input.systemFingerprint,
			toolsetFingerprint: input.toolsetFingerprint,
			payloadFingerprint: this.inFlight.payloadFingerprint,
			inputTokens: input.usage?.input,
			cacheReadTokens: input.usage?.cacheRead,
			cacheWriteTokens: input.usage?.cacheWrite,
			outputTokens: input.usage?.output,
			requestToHeadersMs,
			requestToFirstDeltaMs,
			totalMs,
			httpStatus: this.inFlight.httpStatus,
			errorCategory: input.errorCategory ?? this.inFlight.errorCategory,
			estimatedApiCostMicrousd:
				input.usage !== undefined ? Math.round(Math.max(0, input.usage.cost.total) * 1_000_000) : undefined,
		};

		this.inFlight = undefined;
		return record;
	}

	reset(): void {
		this.inFlight = undefined;
	}
}
