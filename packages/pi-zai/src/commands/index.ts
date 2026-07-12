import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadZaiConfig } from "../config.ts";
import { formatPiCredentialSource } from "../credentials.ts";
import { registerZaiBenchmarkCommand } from "./benchmark.ts";
import { registerZaiCacheCommand } from "./cache.ts";
import { registerZaiDataCommand } from "./data.ts";
import { isPlatformProviderRegistered, resolveModelForEndpoint, type ZaiCommandDeps } from "./deps.ts";
import { registerZaiDoctorCommand } from "./doctor.ts";
import { registerZaiEndpointCommand } from "./endpoint.ts";
import { registerZaiPrivacyCommand } from "./privacy.ts";
import { registerZaiStatusCommand } from "./status.ts";
import { registerZaiTelemetryCommand } from "./telemetry.ts";
import { registerZaiTransportCommand } from "./transport.ts";
import { registerZaiUsageCommand } from "./usage.ts";

export type { ZaiCommandDeps, ZaiEndpoint } from "./deps.ts";
export { isPlatformProviderRegistered, resolveModelForEndpoint };

export function registerZaiCommands(pi: ExtensionAPI, deps: ZaiCommandDeps): void {
	registerZaiStatusCommand(pi, deps);
	registerZaiEndpointCommand(pi, deps);
	registerZaiCacheCommand(pi);
	registerZaiDataCommand(pi, deps);
	registerZaiUsageCommand(pi, deps);
	registerZaiDoctorCommand(pi, deps);
	registerZaiPrivacyCommand(pi, deps);
	registerZaiTransportCommand(pi);
	registerZaiBenchmarkCommand(pi, deps);
	registerZaiTelemetryCommand(pi, deps);
}

export function createDefaultZaiCommandDeps(extensionVersion: string): ZaiCommandDeps {
	return {
		extensionVersion,
		getConfig: loadZaiConfig,
		resolveCredentialSourceName: (provider, ctx) => formatPiCredentialSource(provider, ctx.modelRegistry),
		resolveModelForEndpoint,
		isPlatformProviderRegistered,
	};
}
