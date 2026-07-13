import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { inferEndpoint, type ZaiEndpointKind } from "./state.ts";
import { zaiFetch } from "./zai-fetch.ts";

const CONNECTION_ERROR_PATTERN =
	/connection.?error|connection.?refused|connection.?lost|fetch failed|network.?error|recv failure|reset before headers|socket hang up|timed? out|timeout|terminated|upstream.?connect/i;

const RECOMMENDED_AGENT_RETRIES = 5;
const RECOMMENDED_PROVIDER_RETRIES = 2;

export type EndpointProbeResult = {
	endpoint: ZaiEndpointKind;
	baseUrl: string;
	ok: number;
	fail: number;
	latencyMs: number[];
};

export type PiRetrySettingsSnapshot = {
	enabled: boolean;
	agentMaxRetries: number;
	providerMaxRetries: number;
};

export function isConnectionErrorMessage(message: string | undefined): boolean {
	if (!message) return false;
	return CONNECTION_ERROR_PATTERN.test(message);
}

export function readPiRetrySettings(): PiRetrySettingsSnapshot {
	const path = join(getAgentDir(), "settings.json");
	if (!existsSync(path)) {
		return { enabled: true, agentMaxRetries: 3, providerMaxRetries: 0 };
	}
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
			retry?: { enabled?: boolean; maxRetries?: number; provider?: { maxRetries?: number } };
		};
		return {
			enabled: parsed.retry?.enabled ?? true,
			agentMaxRetries: parsed.retry?.maxRetries ?? 3,
			providerMaxRetries: parsed.retry?.provider?.maxRetries ?? 0,
		};
	} catch {
		return { enabled: true, agentMaxRetries: 3, providerMaxRetries: 0 };
	}
}

export function formatRetrySettingsAdvice(settings: PiRetrySettingsSnapshot): string | undefined {
	const hints: string[] = [];
	if (!settings.enabled) {
		hints.push("Enable Pi auto-retry: retry.enabled = true in ~/.pi/agent/settings.json");
	}
	if (settings.agentMaxRetries < RECOMMENDED_AGENT_RETRIES) {
		hints.push(`Raise agent retries to ${RECOMMENDED_AGENT_RETRIES} (now ${settings.agentMaxRetries})`);
	}
	if (settings.providerMaxRetries < RECOMMENDED_PROVIDER_RETRIES) {
		hints.push(
			`Add SDK retries for transient drops: retry.provider.maxRetries = ${RECOMMENDED_PROVIDER_RETRIES} (now ${settings.providerMaxRetries})`,
		);
	}
	if (hints.length === 0) return undefined;
	return hints.join("; ");
}

export function formatRecommendedRetrySettingsJson(): string {
	return JSON.stringify(
		{
			retry: {
				enabled: true,
				maxRetries: RECOMMENDED_AGENT_RETRIES,
				baseDelayMs: 2000,
				provider: {
					maxRetries: RECOMMENDED_PROVIDER_RETRIES,
					maxRetryDelayMs: 60000,
				},
			},
		},
		null,
		2,
	);
}

export function formatConnectionErrorHint(model: Model<any>): string {
	const endpoint = inferEndpoint(model.provider, model.baseUrl);
	const alternate = endpoint === "platform" ? "coding" : "platform";
	const retry = readPiRetrySettings();
	const retryAdvice = formatRetrySettingsAdvice(retry);

	const lines = [
		"Z.AI connection error (after Pi retries exhausted).",
		"Try:",
		`  /zai-endpoint ${alternate}  (switch endpoint)`,
		"  Check VPN/proxy/firewall to api.z.ai",
		"  /zai-doctor  (connection stability probe)",
	];
	if (retryAdvice) {
		lines.push(`  Pi settings: ${retryAdvice}`);
	}
	return lines.join("\n");
}

/** Any HTTP response means the transport reached api.z.ai (401 = no/invalid auth, not a drop). */
export function isProbeTransportSuccess(httpStatus: number): boolean {
	return httpStatus >= 100 && httpStatus < 600;
}

export async function probeChatEndpoint(
	baseUrl: string,
	apiKey: string,
	attempts = 5,
): Promise<Omit<EndpointProbeResult, "endpoint">> {
	let ok = 0;
	let fail = 0;
	const latencyMs: number[] = [];
	const body = JSON.stringify({
		model: "glm-5.2",
		messages: [{ role: "user", content: "ok" }],
		max_tokens: 4,
		stream: false,
		thinking: { type: "disabled", clear_thinking: true },
	});

	for (let i = 0; i < attempts; i += 1) {
		const started = Date.now();
		try {
			const response = await zaiFetch(`${baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body,
				signal: AbortSignal.timeout(20_000),
			});
			latencyMs.push(Date.now() - started);
			if (isProbeTransportSuccess(response.status)) ok += 1;
			else fail += 1;
		} catch {
			latencyMs.push(Date.now() - started);
			fail += 1;
		}
		if (i + 1 < attempts) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	return { baseUrl, ok, fail, latencyMs };
}

export function formatProbeSummary(result: EndpointProbeResult): string {
	const total = result.ok + result.fail;
	const avg =
		result.latencyMs.length > 0
			? Math.round(result.latencyMs.reduce((sum, value) => sum + value, 0) / result.latencyMs.length)
			: 0;
	return `${result.ok}/${total} ok, avg ${avg}ms`;
}

/**
 * Classification policy for a chat-endpoint probe, kept pure so the threshold
 * contract is unit-testable without mocking the network.
 *
 * The policy is deliberately strict — pass only when every attempt succeeded —
 * because a probe that already shows drops is the earliest honest signal that
 * real traffic will too. We do not tolerate "one transient drop"; if the line
 * is flaky the doctor should say so instead of painting it green.
 */
export function classifyProbeOutcome(probe: Pick<EndpointProbeResult, "ok" | "fail">): "pass" | "warn" | "fail" {
	if (probe.fail === 0 && probe.ok > 0) return "pass";
	if (probe.ok > 0) return "warn";
	return "fail";
}
