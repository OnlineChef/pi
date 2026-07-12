import type { AggregateTelemetryPayload, TelemetryUploadResult } from "./types.ts";
import { validateAggregatePayload } from "./validate.ts";

export async function uploadAggregatePayload(
	payload: AggregateTelemetryPayload,
	ingestUrl: string,
): Promise<TelemetryUploadResult> {
	const validationError = validateAggregatePayload(payload);
	if (validationError) {
		return { day: payload.day, ok: false, error: validationError };
	}

	try {
		const response = await fetch(ingestUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"User-Agent": `pi-zai-telemetry/${payload.extensionVersion}`,
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const body = await response.text();
			return {
				day: payload.day,
				ok: false,
				status: response.status,
				error: body.slice(0, 200) || `HTTP ${response.status}`,
			};
		}

		return { day: payload.day, ok: true, status: response.status };
	} catch (error) {
		return {
			day: payload.day,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
