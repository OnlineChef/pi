import type { ZaiConfig } from "./config.ts";

type ZaiThinkingPayload = {
	type?: string;
	clear_thinking?: boolean;
};

export function normalizeZaiThinkingPayload(payload: unknown, config: ZaiConfig): Record<string, unknown> | undefined {
	if (payload === null || typeof payload !== "object") {
		return undefined;
	}

	const record = payload as Record<string, unknown>;
	const thinking = record.thinking as ZaiThinkingPayload | undefined;
	if (!thinking || typeof thinking !== "object") {
		return undefined;
	}

	if (thinking.type === "enabled") {
		const clearThinking = !config.preserveThinking;
		if (thinking.clear_thinking === clearThinking) {
			return undefined;
		}
		return {
			...record,
			thinking: { ...thinking, clear_thinking: clearThinking },
		};
	}

	if (thinking.type === "disabled" && thinking.clear_thinking !== true) {
		return {
			...record,
			thinking: { ...thinking, clear_thinking: true },
		};
	}

	return undefined;
}
