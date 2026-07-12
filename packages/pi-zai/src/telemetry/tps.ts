import type { Usage } from "@earendil-works/pi-ai";

export type TpsSample = {
	outputTokens: number;
	reasoningTokens: number;
	durationMs: number;
	ttftMs: number | undefined;
	tps: number;
	timestamp: number;
};

export type TpsRollingStats = {
	generationTokens: number;
	durationMs: number;
	requests: number;
	avgTps: number;
};

export type TpsStats = {
	last: TpsSample | undefined;
	rolling: TpsRollingStats;
};

type InFlightSample = {
	startedAt: number;
	ttftMs: number | undefined;
};

export function computeTps(outputTokens: number, durationMs: number): number {
	if (outputTokens <= 0 || durationMs <= 0) {
		return 0;
	}
	return outputTokens / (durationMs / 1000);
}

export function formatTps(value: number): string {
	if (value <= 0) {
		return "0";
	}
	return Math.round(value).toString();
}

export function formatDurationMs(durationMs: number): string {
	if (durationMs < 1000) {
		return `${Math.round(durationMs)}ms`;
	}
	return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatTpsStatusLine(sample: TpsSample, rolling: TpsRollingStats, showAvg: boolean): string {
	const last = formatTps(sample.tps);
	if (!showAvg || rolling.requests <= 1) {
		return `${last} tok/s`;
	}
	return `${last} tok/s (avg ${formatTps(rolling.avgTps)})`;
}

export function formatTpsTelemetryLines(stats: TpsStats | undefined): string[] {
	if (!stats?.last) {
		return ["  none"];
	}

	const { last, rolling } = stats;
	const lines = [
		`  Last: ${formatTps(last.tps)} tok/s (${formatDurationMs(last.durationMs)}, ${last.outputTokens.toLocaleString("en-US")} out)`,
	];
	if (last.ttftMs !== undefined) {
		lines.push(`  TTFT: ${formatDurationMs(last.ttftMs)}`);
	}
	if (rolling.requests > 0) {
		lines.push(
			`  Session avg: ${formatTps(rolling.avgTps)} tok/s (${rolling.requests} ${rolling.requests === 1 ? "request" : "requests"})`,
		);
	}
	return lines;
}

export class TpsTracker {
	private inFlight: InFlightSample | undefined;
	private stats: TpsStats = {
		last: undefined,
		rolling: {
			generationTokens: 0,
			durationMs: 0,
			requests: 0,
			avgTps: 0,
		},
	};

	beginAssistantMessage(startedAt = Date.now()): void {
		this.inFlight = { startedAt, ttftMs: undefined };
	}

	markFirstToken(now = Date.now()): void {
		if (!this.inFlight || this.inFlight.ttftMs !== undefined) {
			return;
		}
		this.inFlight.ttftMs = Math.max(0, now - this.inFlight.startedAt);
	}

	completeAssistantMessage(usage: Pick<Usage, "output" | "reasoning">, endedAt = Date.now()): TpsSample | undefined {
		if (!this.inFlight) {
			return undefined;
		}

		const durationMs = Math.max(1, endedAt - this.inFlight.startedAt);
		const outputTokens = usage.output;
		const sample: TpsSample = {
			outputTokens,
			reasoningTokens: usage.reasoning ?? 0,
			durationMs,
			ttftMs: this.inFlight.ttftMs,
			tps: computeTps(outputTokens, durationMs),
			timestamp: endedAt,
		};

		const rolling = this.stats.rolling;
		rolling.generationTokens += outputTokens;
		rolling.durationMs += durationMs;
		rolling.requests += 1;
		rolling.avgTps = computeTps(rolling.generationTokens, rolling.durationMs);

		this.stats.last = sample;
		this.inFlight = undefined;
		return sample;
	}

	get(): TpsStats {
		return this.stats;
	}

	reset(): void {
		this.inFlight = undefined;
		this.stats = {
			last: undefined,
			rolling: {
				generationTokens: 0,
				durationMs: 0,
				requests: 0,
				avgTps: 0,
			},
		};
	}
}
