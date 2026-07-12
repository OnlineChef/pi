import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Agent } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { FauxProviderRegistration, FauxResponseStep, Model } from "@earendil-works/pi-ai/compat";
import { registerFauxProvider } from "@earendil-works/pi-ai/compat";
import piZai, { sessionState } from "@onlinechefgroep/pi-zai";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSession } from "../../../src/core/agent-session.ts";
import { AuthStorage } from "../../../src/core/auth-storage.ts";
import type { ExtensionRunner, ExtensionUIContext } from "../../../src/core/extensions/index.ts";
import { convertToLlm } from "../../../src/core/messages.ts";
import { ModelRegistry } from "../../../src/core/model-registry.ts";
import { SessionManager } from "../../../src/core/session-manager.ts";
import type { Settings } from "../../../src/core/settings-manager.ts";
import { SettingsManager } from "../../../src/core/settings-manager.ts";
import { initTheme, type Theme, theme } from "../../../src/modes/interactive/theme/theme.ts";
import { createTestExtensionsResult, createTestResourceLoader } from "../../utilities.ts";

const ZAI_COMMANDS = [
	"zai",
	"zai-cache",
	"zai-data",
	"zai-usage",
	"zai-doctor",
	"zai-endpoint",
	"zai-privacy",
	"zai-transport",
	"zai-benchmark",
] as const;

interface PiZaiHarness {
	session: AgentSession;
	faux: FauxProviderRegistration;
	zaiModel: Model<string>;
	setResponses: (responses: FauxResponseStep[]) => void;
	getPendingResponseCount: () => number;
	tempDir: string;
	cleanup: () => void;
}

function createUiContext(
	onNotify: (message: string, type: "info" | "warning" | "error" | undefined) => void,
): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: onNotify,
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => undefined as T,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		get theme() {
			return theme;
		},
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: (_theme: string | Theme) => ({ success: false, error: "Theme switching not available in tests" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}

function createTempDir(): string {
	const tempDir = join(tmpdir(), `pi-zai-suite-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
	return tempDir;
}

function registerFauxZaiOnRegistry(
	modelRegistry: ModelRegistry,
	authStorage: AuthStorage,
	faux: FauxProviderRegistration,
): Model<string> {
	const zaiModel = faux.getModel("glm-5.2") ?? faux.getModel();
	authStorage.setRuntimeApiKey("zai", "faux-key");
	modelRegistry.registerProvider("zai", {
		baseUrl: zaiModel.baseUrl,
		apiKey: "faux-key",
		api: faux.api,
		models: faux.models.map((registeredModel) => ({
			id: registeredModel.id,
			name: registeredModel.name,
			api: registeredModel.api,
			reasoning: registeredModel.reasoning,
			input: registeredModel.input,
			cost: registeredModel.cost,
			contextWindow: registeredModel.contextWindow,
			maxTokens: registeredModel.maxTokens,
			baseUrl: registeredModel.baseUrl,
		})),
	});
	return zaiModel;
}

function writeProjectZaiSettings(tempDir: string, zai: Record<string, unknown>): void {
	const piDir = join(tempDir, ".pi");
	mkdirSync(piDir, { recursive: true });
	writeFileSync(join(piDir, "settings.json"), `${JSON.stringify({ zai }, null, 2)}\n`, "utf-8");
}

async function createPiZaiHarness(
	options: { settings?: Partial<Settings>; zaiSettings?: Record<string, unknown> } = {},
): Promise<PiZaiHarness> {
	const tempDir = createTempDir();
	if (options.zaiSettings) {
		writeProjectZaiSettings(tempDir, options.zaiSettings);
	}
	const faux = registerFauxProvider({
		provider: "zai",
		models: [{ id: "glm-5.2", name: "GLM-5.2", reasoning: true }],
	});
	faux.setResponses([]);

	const zaiModel = faux.getModel("glm-5.2") ?? faux.getModel();
	const extensionRunnerRef: { current?: ExtensionRunner } = {};

	const sessionManager = SessionManager.inMemory();
	const settingsManager = SettingsManager.inMemory(options.settings);
	const authStorage = AuthStorage.inMemory();
	const modelRegistry = ModelRegistry.inMemory(authStorage);
	registerFauxZaiOnRegistry(modelRegistry, authStorage, faux);

	const agent = new Agent({
		getApiKey: () => "faux-key",
		initialState: {
			model: zaiModel,
			systemPrompt: "You are a test assistant.",
			tools: [],
		},
		convertToLlm,
		onPayload: async (payload) => {
			const runner = extensionRunnerRef.current;
			if (!runner?.hasHandlers("before_provider_request")) {
				return payload;
			}
			return runner.emitBeforeProviderRequest(payload);
		},
		onResponse: async (response) => {
			const runner = extensionRunnerRef.current;
			if (!runner?.hasHandlers("after_provider_response")) {
				return;
			}
			await runner.emit({
				type: "after_provider_response",
				status: response.status,
				headers: response.headers,
			});
		},
		transformContext: async (messages: AgentMessage[]) => {
			const runner = extensionRunnerRef.current;
			if (!runner) return messages;
			return runner.emitContext(messages);
		},
	});

	const extensionsResult = await createTestExtensionsResult([piZai], tempDir);
	const resourceLoader = createTestResourceLoader({ extensionsResult });

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: tempDir,
		modelRegistry,
		resourceLoader,
		extensionRunnerRef,
	});

	const refreshedZaiModel = registerFauxZaiOnRegistry(modelRegistry, authStorage, faux);
	await session.setModel(refreshedZaiModel);

	return {
		session,
		faux,
		zaiModel: refreshedZaiModel,
		setResponses: faux.setResponses,
		getPendingResponseCount: faux.getPendingResponseCount,
		tempDir,
		cleanup() {
			session.dispose();
			faux.unregister();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true });
			}
		},
	};
}

describe("pi-zai extension integration", () => {
	initTheme("dark", false);

	const harnesses: PiZaiHarness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("registers zai slash commands", async () => {
		const harness = await createPiZaiHarness();
		harnesses.push(harness);

		const commandNames = harness.session.extensionRunner
			.getRegisteredCommands()
			.map((command) => command.invocationName);

		for (const name of ZAI_COMMANDS) {
			expect(commandNames).toContain(name);
		}
	});

	it("dispatches /zai-cache explain without an LLM call", async () => {
		const notifications: string[] = [];
		const harness = await createPiZaiHarness();
		harnesses.push(harness);

		await harness.session.bindExtensions({
			uiContext: createUiContext((message) => notifications.push(message)),
			mode: "tui",
		});

		await harness.session.prompt("/zai-cache explain");

		expect(harness.getPendingResponseCount()).toBe(0);
		expect(notifications.some((message) => message.includes("Z.AI implicit cache"))).toBe(true);
	});

	it("does not auto-register zai-platform on bindExtensions", async () => {
		const harness = await createPiZaiHarness();
		harnesses.push(harness);

		const before = harness.session.modelRegistry.find("zai-platform", "glm-5.2");

		await harness.session.bindExtensions({
			uiContext: createUiContext(() => {}),
			mode: "tui",
		});

		const after = harness.session.modelRegistry.find("zai-platform", "glm-5.2");
		expect(after).toBe(before);
	});

	it("does not set X-Session-Id by default", async () => {
		const harness = await createPiZaiHarness();
		harnesses.push(harness);

		await harness.session.bindExtensions({
			uiContext: createUiContext(() => {}),
			mode: "tui",
		});

		const headers = await harness.session.extensionRunner.emitBeforeProviderHeaders({});

		expect(headers["X-Session-Id"]).toBeUndefined();
		expect(headers["User-Agent"]).toMatch(/^pi-zai\//);
	});

	it("sets X-Session-Id when sessionAffinity is experimental", async () => {
		const harness = await createPiZaiHarness({ zaiSettings: { sessionAffinity: "experimental" } });
		harnesses.push(harness);

		await harness.session.bindExtensions({
			uiContext: createUiContext(() => {}),
			mode: "tui",
		});

		const headers = await harness.session.extensionRunner.emitBeforeProviderHeaders({});

		expect(headers["X-Session-Id"]).toBe(sessionState.sessionAffinityId);
		expect(headers["User-Agent"]).toMatch(/^pi-zai\//);
	});

	it("records cache metrics after a faux Z.AI response", async () => {
		const notifications: string[] = [];
		const harness = await createPiZaiHarness();
		harnesses.push(harness);

		await harness.session.bindExtensions({
			uiContext: createUiContext((message) => notifications.push(message)),
			mode: "tui",
		});

		harness.setResponses([fauxAssistantMessage("ok")]);

		await harness.session.prompt("hello");
		await harness.session.agent.waitForIdle();
		notifications.length = 0;

		await harness.session.prompt("/zai-cache status");

		expect(harness.getPendingResponseCount()).toBe(0);
		const status = notifications.join("\n");
		expect(status).not.toContain("No cache metrics recorded yet");
		expect(status).toContain("Z.AI cache diagnostics");
		expect(status).toContain("Requests in segment: 1");
		expect(status).toContain("Uncached (input):");
	});
});
