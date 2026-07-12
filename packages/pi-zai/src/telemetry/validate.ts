import { type AggregateTelemetryPayload, FORBIDDEN_TELEMETRY_KEYS } from "./types.ts";

export function validateAggregatePayload(payload: AggregateTelemetryPayload): string | undefined {
	if (payload.schema !== 1) return "schema must be 1";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.day)) return "day must be YYYY-MM-DD";
	if (payload.attempts < 0 || payload.errors < 0) return "counts must be non-negative";
	const serialized = JSON.stringify(payload).toLowerCase();
	for (const key of FORBIDDEN_TELEMETRY_KEYS) {
		if (serialized.includes(`"${key}"`)) {
			return `forbidden field: ${key}`;
		}
	}
	return undefined;
}

export function containsForbiddenTelemetryKey(key: string): boolean {
	const normalized = key.toLowerCase();
	return FORBIDDEN_TELEMETRY_KEYS.some((forbidden) => normalized.includes(forbidden));
}
