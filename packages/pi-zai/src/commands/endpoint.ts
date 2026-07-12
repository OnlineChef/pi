import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ZaiCommandDeps } from "./deps.ts";
import { getEndpointLabel } from "./helpers.ts";

const ENDPOINTS = ["coding", "platform"] as const;

export function registerZaiEndpointCommand(pi: ExtensionAPI, deps: ZaiCommandDeps): void {
	pi.registerCommand("zai-endpoint", {
		description: "Switch between Z.AI Coding Plan and Platform API endpoints",
		getArgumentCompletions: (prefix) => {
			const matches = ENDPOINTS.filter((value) => value.startsWith(prefix));
			return matches.length > 0
				? matches.map((value) => ({
						value,
						label: value === "coding" ? "Coding Plan" : "Platform API",
					}))
				: null;
		},
		handler: async (args, ctx) => {
			const endpoint = args.trim().toLowerCase();
			if (endpoint !== "coding" && endpoint !== "platform") {
				ctx.ui.notify("Usage: /zai-endpoint coding|platform", "warning");
				return;
			}

			const modelId = ctx.model?.id ?? "glm-5.2";
			const target = deps.resolveModelForEndpoint(ctx, endpoint, modelId);
			if (!target) {
				ctx.ui.notify(
					endpoint === "platform"
						? `Platform model ${modelId} is not registered. Reload extensions or check zai-platform provider setup.`
						: `Coding Plan model ${modelId} is not available in the model registry.`,
					"error",
				);
				return;
			}

			const success = await pi.setModel(target);
			if (!success) {
				ctx.ui.notify(`No API key available for ${target.provider}. Configure credentials and retry.`, "error");
				return;
			}

			ctx.ui.notify(
				`Switched to ${getEndpointLabel(target)} (${target.provider}/${target.id}) via Pi model selection.`,
				"info",
			);
		},
	});
}
