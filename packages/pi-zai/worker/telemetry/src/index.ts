export interface Env {
	PI_ZAI_TELEMETRY?: AnalyticsEngineDataset;
}

type ProviderModelRow = {
	provider: string;
	model: string;
	endpointKind: string;
	attempts: number;
	errors: number;
};

type AggregateBody = {
	schema: number;
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
	byProviderModel: ProviderModelRow[];
	errorCategories: Record<string, number>;
};

const FORBIDDEN_KEY_NAMES = [
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
	"cwd",
	"hostname",
	"installid",
	"install_id",
	"apikey",
	"api_key",
	"secret",
] as const;

function normalizeKey(key: string): string {
	return key.toLowerCase().replace(/_/g, "");
}

function isForbiddenKeyName(key: string): boolean {
	const normalized = normalizeKey(key);
	return FORBIDDEN_KEY_NAMES.some((token) => normalized.includes(token.replace(/_/g, "")));
}

function validateProviderRow(row: unknown, index: number): string | undefined {
	if (!row || typeof row !== "object") return `byProviderModel[${index}] must be an object`;
	const record = row as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (isForbiddenKeyName(key)) return `forbidden field: byProviderModel[${index}].${key}`;
	}
	const allowed = new Set(["provider", "model", "endpointKind", "attempts", "errors"]);
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) return `unknown field: byProviderModel[${index}].${key}`;
	}
	return undefined;
}

function validateBody(body: AggregateBody): string | undefined {
	if (body.schema !== 1) return "schema must be 1";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day)) return "invalid day";
	if (body.attempts < 0 || body.errors < 0) return "negative counts";
	if (!Array.isArray(body.byProviderModel)) return "byProviderModel must be an array";
	if (!body.errorCategories || typeof body.errorCategories !== "object") return "errorCategories must be an object";

	for (const key of Object.keys(body.errorCategories)) {
		if (isForbiddenKeyName(key)) return `forbidden field: errorCategories.${key}`;
	}

	for (let index = 0; index < body.byProviderModel.length; index += 1) {
		const rowError = validateProviderRow(body.byProviderModel[index], index);
		if (rowError) return rowError;
	}

	const serialized = JSON.stringify(body).toLowerCase();
	for (const token of FORBIDDEN_KEY_NAMES) {
		if (serialized.includes(`"${token}"`) || serialized.includes(`"${token.replace(/_/g, "")}"`)) {
			return `forbidden field: ${token}`;
		}
	}

	return undefined;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== "/pi-zai/telemetry/v1/aggregate") {
			return new Response("Not found", { status: 404 });
		}
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		let body: AggregateBody;
		try {
			body = (await request.json()) as AggregateBody;
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}

		const validationError = validateBody(body);
		if (validationError) {
			return Response.json({ ok: false, error: validationError }, { status: 400 });
		}

		env.PI_ZAI_TELEMETRY?.writeDataPoint({
			blobs: [body.day, body.extensionVersion, body.promptMode, body.turnBucket, body.cacheRatioBucket],
			doubles: [
				body.attempts,
				body.errors,
				body.inputTokens,
				body.cacheReadTokens,
				body.cacheWriteTokens,
				body.outputTokens,
			],
			indexes: [body.extensionVersion],
		});

		return Response.json({ ok: true, day: body.day }, { status: 202 });
	},
};
