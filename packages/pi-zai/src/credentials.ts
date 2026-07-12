import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

/** Pi-native credential label for status/doctor output; never returns secret values. */
export function formatPiCredentialSource(provider: string, modelRegistry: ModelRegistry | undefined): string {
	const auth = modelRegistry?.getProviderAuthStatus(provider);
	if (!auth?.configured) return "not configured";
	if (auth.source === "environment" && auth.label) return auth.label;
	if (auth.source === "models_json_command") return "models.json (command)";
	if (auth.source === "models_json_key") return "models.json (key)";
	if (auth.source === "stored") return "auth.json";
	if (auth.source === "runtime") return "runtime";
	if (auth.source === "fallback") return "fallback";
	return auth.source ?? "configured";
}
