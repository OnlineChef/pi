import type { ZaiConfig } from "../config.ts";
import type { MetricsStorage } from "../storage/types.ts";
import { buildAggregatePayloadForDay } from "./aggregate.ts";
import { hasTelemetryConsent } from "./consent.ts";
import { TELEMETRY_INGEST_URL, type TelemetrySyncResult, type TelemetryUploadResult } from "./types.ts";
import { uploadAggregatePayload } from "./uploader.ts";

export function isTelemetryUploadEnabled(config: ZaiConfig): boolean {
	return config.telemetryMode === "aggregate" && hasTelemetryConsent();
}

export function resolveTelemetryIngestUrl(config: ZaiConfig): string {
	return config.telemetryIngestUrl ?? TELEMETRY_INGEST_URL;
}

export async function uploadTelemetryDay(input: {
	day: string;
	config: ZaiConfig;
	extensionVersion: string;
	storage: MetricsStorage;
}): Promise<TelemetryUploadResult> {
	if (!isTelemetryUploadEnabled(input.config)) {
		return {
			day: input.day,
			ok: false,
			error: "telemetry not enabled (set mode aggregate and /zai-telemetry enable)",
		};
	}
	if (input.storage.isTelemetryDayUploaded(input.day)) {
		return { day: input.day, ok: true, error: "already uploaded" };
	}

	const payload = buildAggregatePayloadForDay(input);
	if (!payload) {
		return { day: input.day, ok: false, error: "no aggregate data for day" };
	}

	const result = await uploadAggregatePayload(payload, resolveTelemetryIngestUrl(input.config));
	if (result.ok) {
		input.storage.markTelemetryDayUploaded(input.day, Date.now());
	}
	return result;
}

export async function syncPendingTelemetry(input: {
	config: ZaiConfig;
	extensionVersion: string;
	storage: MetricsStorage;
	now?: number;
}): Promise<TelemetrySyncResult> {
	const now = input.now ?? Date.now();
	const uploaded: TelemetryUploadResult[] = [];
	const skipped: string[] = [];

	if (!isTelemetryUploadEnabled(input.config)) {
		return { uploaded, skipped };
	}

	for (const day of input.storage.listPendingTelemetryDays(now)) {
		const result = await uploadTelemetryDay({ ...input, day });
		if (result.ok && result.error !== "already uploaded") {
			uploaded.push(result);
		} else if (!result.ok) {
			skipped.push(`${day}: ${result.error ?? "failed"}`);
		}
	}

	return { uploaded, skipped };
}
