import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildCompactionInstructions, ZAI_COMPACTION_SECTIONS } from "../cache/compaction.ts";
import { canonicalStableSystemPrefix } from "../cache/context-policy.ts";
import { fingerprintToolset } from "../cache/fingerprint.ts";
import {
	classifyProbeOutcome,
	formatProbeSummary,
	formatRecommendedRetrySettingsJson,
	formatRetrySettingsAdvice,
	probeChatEndpoint,
	readPiRetrySettings,
} from "../resilience.ts";
import { inferEndpoint, sessionState } from "../state.ts";
import { zaiFetch } from "../zai-fetch.ts";
import type { ZaiCommandDeps } from "./deps.ts";
import { describeThinkingPayload, formatCredentialSource, getZaiCompat, requireZaiModel } from "./helpers.ts";

type CheckStatus = "pass" | "fail" | "skip" | "warn";

type DoctorCheck = {
	name: string;
	status: CheckStatus;
	detail: string;
};

const DOCTOR_THINKING_LEVELS = ["off", "high", "max" as ThinkingLevel] as const;

function statusIcon(status: CheckStatus): string {
	switch (status) {
		case "pass":
			return "ok";
		case "fail":
			return "fail";
		case "skip":
			return "skip";
		case "warn":
			return "warn";
	}
}

/** GLM-5.2 is the only Z.AI model exposing reasoning_effort, so it is the only one with a thinkingLevelMap. */
function isReasoningEffortModel(model: Model<any> | undefined): boolean {
	return (model?.compat as { supportsReasoningEffort?: boolean } | undefined)?.supportsReasoningEffort === true;
}

/**
 * Validate the GLM-5.2 thinkingLevelMap against its functional contract:
 *  - `high` and `max` must be exposed (the two Z.AI reasoning_effort values we use)
 *  - `minimal`/`low`/`medium` must be hidden (null) — they clamp up to `high`
 *  - `xhigh` is optional: built-in `zai/glm-5.2` hides it (null), the optional
 *    `zai-platform` catalog maps it to `"max"`. Both shapes are valid, so the
 *    doctor must accept either instead of hard-coding a single expectation.
 */
export function glm52ThinkingMapOk(model: Model<any> | undefined): boolean {
	if (!model?.thinkingLevelMap) return false;
	const map = model.thinkingLevelMap;
	const xhighOk = map.xhigh === null || map.xhigh === "high" || map.xhigh === "max";
	return (
		map.minimal === null &&
		map.low === null &&
		map.medium === null &&
		map.high === "high" &&
		xhighOk &&
		map.max === "max"
	);
}

export function hasPlatformPricing(model: Model<any> | undefined): boolean {
	if (!model) return false;
	const { input, output } = model.cost;
	return input > 0 || output > 0;
}

async function runNetworkProbe(ctx: ExtensionCommandContext, model: Model<any>): Promise<DoctorCheck> {
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		return {
			name: "Network probe",
			status: "skip",
			detail: "No credentials available; skipped live request.",
		};
	}

	// Z.AI's coding PAAS v4 endpoint does not expose an OpenAI-style GET /models
	// route (the server resets the connection → "fetch failed"). Probe the real
	// /chat/completions endpoint with a minimal non-streaming request so the
	// reachability check reflects actual model traffic.
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 20_000);
	try {
		const body = JSON.stringify({
			model: model.id,
			messages: [{ role: "user", content: "ok" }],
			max_tokens: 1,
			stream: false,
			thinking: { type: "disabled", clear_thinking: true },
		});
		const response = await zaiFetch(`${model.baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: auth.headers?.Authorization ?? `Bearer ${auth.apiKey}`,
				"Content-Type": "application/json",
				...auth.headers,
			},
			body,
			signal: controller.signal,
		});
		if (response.ok || response.status === 401 || response.status === 403) {
			const authNote =
				response.status === 401 || response.status === 403
					? " (transport ok; check credentials if requests fail in chat)"
					: "";
			return {
				name: "Network probe",
				status: "pass",
				detail: `Reachable (${response.status}) at ${model.baseUrl}/chat/completions${authNote}`,
			};
		}
		return {
			name: "Network probe",
			status: "warn",
			detail: `Responded with HTTP ${response.status}; credentials present but request not fully successful.`,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		return {
			name: "Network probe",
			status: "warn",
			detail: `Request failed: ${message}`,
		};
	} finally {
		clearTimeout(timeout);
	}
}

async function runConnectionStabilityProbe(ctx: ExtensionCommandContext, model: Model<any>): Promise<DoctorCheck> {
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) {
		return {
			name: "Connection stability",
			status: "skip",
			detail: "No credentials available; skipped chat probe.",
		};
	}

	// Five attempts give a statistically meaningful success ratio for detecting
	// intermittent drops (1 fail in 3 is noisy; 1 fail in 5 is a clearer signal).
	const probe = await probeChatEndpoint(model.baseUrl, auth.apiKey, 5);
	const summary = formatProbeSummary({
		endpoint: inferEndpoint(model.provider, model.baseUrl),
		...probe,
	});
	const outcome = classifyProbeOutcome(probe);
	if (outcome === "pass") {
		return {
			name: "Connection stability",
			status: "pass",
			detail: `${summary} at ${model.baseUrl}`,
		};
	}
	if (outcome === "warn") {
		// Tailor the advice to what the user can still change. If Pi retries are
		// already strong, telling them to raise retry.provider.maxRetries is
		// noise — point them at the endpoint switch and host-side checks instead.
		const retry = readPiRetrySettings();
		const retryAlreadyStrong = retry.enabled && retry.agentMaxRetries >= 5 && retry.providerMaxRetries >= 2;
		const hint = retryAlreadyStrong
			? "Retries already strong; try /zai-endpoint or check VPN/proxy/firewall to api.z.ai"
			: "Try /zai-endpoint or Pi retry.provider.maxRetries=2";
		return {
			name: "Connection stability",
			status: "warn",
			detail: `${summary} at ${model.baseUrl}; intermittent drops likely (Connection error). ${hint}`,
		};
	}
	return {
		name: "Connection stability",
		status: "fail",
		detail: `${summary} at ${model.baseUrl}; endpoint unreachable from this host`,
	};
}

export function registerZaiDoctorCommand(pi: ExtensionAPI, deps: ZaiCommandDeps): void {
	pi.registerCommand("zai-doctor", {
		description: "Z.AI integration checks with optional live network probes",
		handler: async (_args, ctx) => {
			const checks: DoctorCheck[] = [];
			const config = deps.getConfig(ctx.cwd);
			const codingModel = ctx.modelRegistry.find("zai", "glm-5.2");
			const platformModel = ctx.modelRegistry.find("zai-platform", "glm-5.2");
			const active = ctx.model;

			checks.push({
				name: "Extension loaded",
				status: "pass",
				detail: `@onlinechefgroep/pi-zai ${deps.extensionVersion}`,
			});

			checks.push({
				name: "Pi compatibility",
				status: "pass",
				detail: "Requires @earendil-works/pi-coding-agent >= 0.80.0 with native Z.AI transport.",
			});

			checks.push({
				name: "Built-in Z.AI provider",
				status: codingModel ? "pass" : "fail",
				detail: codingModel ? "zai/glm-5.2 present" : "zai/glm-5.2 missing from registry",
			});

			checks.push({
				name: "Platform provider (optional)",
				status: deps.isPlatformProviderRegistered(ctx) && platformModel ? "pass" : "skip",
				detail: platformModel
					? "zai-platform/glm-5.2 present in models.json"
					: "Not registered by pi-zai; add zai-platform manually via models.json if needed",
			});

			const credentialProvider = active?.provider ?? "zai";
			const credentialName =
				(await deps.resolveCredentialSourceName(credentialProvider, ctx)) ??
				formatCredentialSource(credentialProvider, ctx);
			const credentialConfigured = ctx.modelRegistry.getProviderAuthStatus(credentialProvider).configured;
			checks.push({
				name: "Credential availability",
				status: credentialConfigured ? "pass" : "warn",
				detail: credentialConfigured
					? `Source name: ${credentialName} (value never printed)`
					: "No credential configured for active provider",
			});

			const thinkingModel = active ?? codingModel;
			if (isReasoningEffortModel(thinkingModel)) {
				const mapOk = glm52ThinkingMapOk(thinkingModel);
				// Both shapes are functionally equivalent: with xhigh=null pi's
				// clampThinkingLevel() still routes xhigh → max, so users always get
				// max reasoning. The only difference is whether xhigh appears in the
				// thinking selector. Report which shape is active so the detail line
				// is honest rather than a generic "ok".
				const xhighMapped = thinkingModel?.thinkingLevelMap?.xhigh;
				const shape =
					xhighMapped === null
						? "built-in shape (xhigh hidden, clamps to max)"
						: xhighMapped === "max"
							? "platform shape (xhigh → max)"
							: "custom shape";
				checks.push({
					name: "GLM-5.2 thinkingLevelMap",
					status: mapOk ? "pass" : "warn",
					detail: mapOk
						? `off/high/max exposed; minimal/low/medium hidden (clamp to high); ${shape}`
						: "Unexpected thinkingLevelMap on active or default model",
				});
			} else {
				checks.push({
					name: "GLM-5.2 thinkingLevelMap",
					status: "skip",
					detail: `${thinkingModel?.id ?? "model"} has no reasoning_effort control; thinkingLevelMap not applicable`,
				});
			}

			for (const level of DOCTOR_THINKING_LEVELS) {
				checks.push({
					name: `Payload (${level})`,
					status: "pass",
					detail: describeThinkingPayload(config, level, thinkingModel),
				});
			}

			checks.push({
				name: "clear_thinking default",
				status: config.preserveThinking ? "warn" : "pass",
				detail: config.preserveThinking
					? "preserveThinking enabled; clear_thinking=false when thinking is on"
					: "preserveThinking disabled; clear_thinking=true when thinking is on (cost-first)",
			});

			checks.push({
				name: "Tool streaming",
				status: getZaiCompat(thinkingModel)?.zaiToolStream ? "pass" : "warn",
				detail: getZaiCompat(thinkingModel)?.zaiToolStream
					? "zaiToolStream enabled on active/default model"
					: "zaiToolStream not enabled on inspected model",
			});

			checks.push({
				name: "Cache affinity header",
				status: config.sessionAffinity === "experimental" ? "pass" : "skip",
				detail:
					config.sessionAffinity === "experimental"
						? `X-Session-Id enabled (id ${sessionState.sessionAffinityId.slice(0, 12)}...)`
						: "X-Session-Id off (set zai.sessionAffinity=experimental to enable)",
			});

			checks.push({
				name: "Streamed usage + cached tokens",
				status: "pass",
				detail: "Handled by upstream pi-ai openai-completions Z.AI parser (cacheRead from cached_tokens).",
			});

			const platformRegistered = deps.isPlatformProviderRegistered(ctx) && platformModel !== undefined;
			checks.push({
				name: "Platform pricing metadata",
				status: !platformRegistered ? "skip" : hasPlatformPricing(platformModel) ? "pass" : "warn",
				detail: !platformRegistered
					? "Platform provider not registered; pricing n/a"
					: hasPlatformPricing(platformModel)
						? "Platform glm-5.2 has non-zero pricing metadata"
						: "Platform glm-5.2 pricing metadata missing or zero",
			});

			const stableSample = canonicalStableSystemPrefix("Project rules\nCurrent git status: dirty");
			checks.push({
				name: "Stable system prefix",
				status: stableSample.length > 0 && !stableSample.includes("git status") ? "pass" : "fail",
				detail: "Volatile git/timestamp lines excluded from canonical prefix",
			});

			const toolFingerprint = fingerprintToolset([
				{
					name: "read",
					description: "Read files",
					parameters: { type: "object", properties: { path: { type: "string" } } },
				},
			]);
			checks.push({
				name: "Stable tool definitions",
				status: toolFingerprint.length === 16 ? "pass" : "fail",
				detail: `Deterministic toolset fingerprint length ${toolFingerprint.length}`,
			});

			const compaction = buildCompactionInstructions();
			const compactionOk = ZAI_COMPACTION_SECTIONS.every((section) => compaction.includes(section));
			checks.push({
				name: "Compaction policy",
				status: compactionOk ? "pass" : "fail",
				detail: compactionOk
					? "Deterministic sections; hidden reasoning dropped by default"
					: "Compaction template missing required sections",
			});

			if (credentialConfigured && thinkingModel) {
				checks.push(await runNetworkProbe(ctx, thinkingModel));
				checks.push(await runConnectionStabilityProbe(ctx, thinkingModel));
			} else {
				checks.push({
					name: "Network probe",
					status: "skip",
					detail: "Skipped because credentials are not configured.",
				});
				checks.push({
					name: "Connection stability",
					status: "skip",
					detail: "Skipped because credentials are not configured.",
				});
			}

			const retrySettings = readPiRetrySettings();
			const retryAdvice = formatRetrySettingsAdvice(retrySettings);
			checks.push({
				name: "Pi retry settings",
				status: retryAdvice ? "warn" : "pass",
				detail: retryAdvice
					? `${retryAdvice}. Suggested snippet:\n${formatRecommendedRetrySettingsJson()}`
					: `enabled=${retrySettings.enabled}, agentMaxRetries=${retrySettings.agentMaxRetries}, providerMaxRetries=${retrySettings.providerMaxRetries}`,
			});

			const zaiCheck = requireZaiModel(ctx);
			if ("error" in zaiCheck) {
				checks.push({
					name: "Active Z.AI session",
					status: "warn",
					detail: zaiCheck.error,
				});
			} else {
				checks.push({
					name: "Active Z.AI session",
					status: "pass",
					detail: `${zaiCheck.model.provider}/${zaiCheck.model.id}`,
				});
			}

			const lines = [
				"Z.AI doctor",
				"",
				...checks.map((check) => `[${statusIcon(check.status)}] ${check.name}: ${check.detail}`),
			];
			const hasFail = checks.some((check) => check.status === "fail");
			ctx.ui.notify(lines.join("\n"), hasFail ? "error" : "info");
		},
	});
}
