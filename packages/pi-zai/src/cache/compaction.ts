import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const ZAI_COMPACTION_SECTIONS = [
	"## Stable project facts",
	"## Decisions and outcomes",
	"## Current task progress",
] as const;

/**
 * Deterministic Z.AI-aware compaction instructions.
 * No timestamps; preserves visible outcomes; drops hidden reasoning by default.
 */
export function buildCompactionInstructions(): string {
	return [
		"Summarize the conversation for continuation on Z.AI.",
		"Use this deterministic structure in the same order every time:",
		ZAI_COMPACTION_SECTIONS[0],
		"- List durable project paths, conventions, and constraints.",
		ZAI_COMPACTION_SECTIONS[1],
		"- Preserve visible decisions, edits, file paths, test results, tool outcomes, and unresolved work.",
		ZAI_COMPACTION_SECTIONS[2],
		"- Describe active work and next steps.",
		"Do not include timestamps unless materially required.",
		"Do not preserve hidden reasoning or thinking blocks.",
		"Keep section headings and ordering exactly as listed.",
	].join("\n");
}

export type CompactionHookOptions = {
	customInstructions: string;
	replaceInstructions: boolean;
	dropHiddenReasoning: boolean;
};

export function getCompactionHookOptions(): CompactionHookOptions {
	return {
		customInstructions: buildCompactionInstructions(),
		replaceInstructions: true,
		dropHiddenReasoning: true,
	};
}

/** Apply Z.AI compaction focus to Pi's mutable compact event payload. */
export function applyZaiCompactionInstructions(event: { customInstructions?: string }): void {
	event.customInstructions = buildCompactionInstructions();
}

/** Apply Z.AI branch-summary focus for tree navigation. */
export function applyZaiTreeSummaryInstructions(): {
	customInstructions: string;
	replaceInstructions: boolean;
} {
	const options = getCompactionHookOptions();
	return {
		customInstructions: options.customInstructions,
		replaceInstructions: options.replaceInstructions,
	};
}

export function stripHiddenReasoningFromMessages(messages: AgentMessage[]): AgentMessage[] {
	return messages.map((message) => {
		if (message.role !== "assistant" || !Array.isArray(message.content)) {
			return message;
		}
		const filtered = message.content.filter((block) => block.type !== "thinking");
		if (filtered.length === message.content.length) {
			return message;
		}
		return { ...message, content: filtered };
	});
}

export function prepareMessagesForCompaction(
	messages: AgentMessage[],
	options: Pick<CompactionHookOptions, "dropHiddenReasoning"> = { dropHiddenReasoning: true },
): AgentMessage[] {
	if (!options.dropHiddenReasoning) {
		return messages;
	}
	return stripHiddenReasoningFromMessages(messages);
}

export function compactionDropsHiddenReasoning(messages: AgentMessage[]): boolean {
	for (const message of messages) {
		if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
		if (message.content.some((block) => block.type === "thinking")) {
			return false;
		}
	}
	return true;
}

export function compactionPreservesVisibleOutcomes(messages: AgentMessage[]): boolean {
	for (const message of messages) {
		if (message.role === "assistant" && Array.isArray(message.content)) {
			if (message.content.some((block) => block.type === "text" || block.type === "toolCall")) {
				return true;
			}
		}
		if (message.role === "toolResult") {
			return true;
		}
	}
	return false;
}
