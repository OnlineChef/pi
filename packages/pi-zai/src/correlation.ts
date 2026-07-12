import { createHash } from "node:crypto";

function stableSerialize(value: unknown): string {
	if (value === null || value === undefined) {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
	}
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record).sort();
		return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

export function hashSessionId(sessionId: string): string {
	return createHash("sha256").update(`pi-zai:session:${sessionId}`).digest("hex").slice(0, 16);
}

export function fingerprintPayload(payload: unknown): string {
	return createHash("sha256").update(stableSerialize(payload)).digest("hex").slice(0, 16);
}

export class QueryCorrelation {
	private queryCounter = 0;
	private currentQueryId: string | undefined;
	private attemptCounter = 0;

	beginQuery(): string {
		this.queryCounter += 1;
		this.attemptCounter = 0;
		this.currentQueryId = `q-${String(this.queryCounter).padStart(4, "0")}-${createHash("sha256")
			.update(`pi-zai:query:${this.queryCounter}:${Date.now()}`)
			.digest("hex")
			.slice(0, 8)}`;
		return this.currentQueryId;
	}

	nextAttempt(): { queryId: string; requestId: string; attempt: number } {
		if (!this.currentQueryId) {
			this.beginQuery();
		}
		this.attemptCounter += 1;
		const queryId = this.currentQueryId!;
		return {
			queryId,
			requestId: `${queryId}-a${this.attemptCounter}`,
			attempt: this.attemptCounter,
		};
	}

	reset(): void {
		this.queryCounter = 0;
		this.currentQueryId = undefined;
		this.attemptCounter = 0;
	}
}
