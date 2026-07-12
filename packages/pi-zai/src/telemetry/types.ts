export const TELEMETRY_INGEST_URL = "https://api.chefgroep.online/pi-zai/telemetry/v1/aggregate";

export const FORBIDDEN_TELEMETRY_KEYS = [
	"projectid",
	"project_id",
	"sessionhash",
	"session_hash",
	"sessionid",
	"session_id",
	"queryid",
	"query_id",
	"requestid",
	"request_id",
	"fingerprint",
	"prompt",
	"path",
	"cwd",
	"hostname",
	"installid",
	"install_id",
	"apikey",
	"api_key",
	"secret",
] as const;

export type AggregateTelemetryPayload = {
	schema: 1;
	day: string;
	extensionVersion: string;
	promptMode: string;
	attempts: number;
	errors: number;
	inputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	outputTokens: number;
	turnBucket: string;
	cacheRatioBucket: string;
	retryRateBucket: string;
	byProviderModel: Array<{
		provider: string;
		model: string;
		endpointKind: string;
		attempts: number;
		errors: number;
	}>;
	errorCategories: Record<string, number>;
};

export type TelemetryUploadResult = {
	day: string;
	ok: boolean;
	status?: number;
	error?: string;
};

export type TelemetrySyncResult = {
	uploaded: TelemetryUploadResult[];
	skipped: string[];
};
