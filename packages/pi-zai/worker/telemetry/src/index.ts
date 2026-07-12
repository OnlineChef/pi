export interface Env {
	PI_ZAI_TELEMETRY?: AnalyticsEngineDataset;
}

type AggregateBody = {
	schema: number;
	day: string;
	extensionVersion: string;
	promptMode: string;
	attempts: number;
	errors: number;
};

const FORBIDDEN = [
	"project",
	"session",
	"fingerprint",
	"prompt",
	"path",
	"cwd",
	"hostname",
	"install",
	"apikey",
	"secret",
	"query",
	"request",
];

function containsForbiddenKey(value: unknown, path = ""): string | undefined {
	if (value === null || typeof value !== "object") return undefined;
	if (Array.isArray(value)) {
		for (const entry of value) {
			const hit = containsForbiddenKey(entry, path);
			if (hit) return hit;
		}
		return undefined;
	}
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		const full = `${path}.${key}`.toLowerCase();
		for (const token of FORBIDDEN) {
			if (full.includes(token)) return full;
		}
		const hit = containsForbiddenKey(nested, full);
		if (hit) return hit;
	}
	return undefined;
}

function validateBody(body: AggregateBody): string | undefined {
	if (body.schema !== 1) return "schema must be 1";
	if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day)) return "invalid day";
	if (body.attempts < 0 || body.errors < 0) return "negative counts";
	return containsForbiddenKey(body);
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
			blobs: [body.day, body.extensionVersion, body.promptMode],
			doubles: [body.attempts, body.errors],
			indexes: [body.extensionVersion],
		});

		return Response.json({ ok: true, day: body.day }, { status: 202 });
	},
};
