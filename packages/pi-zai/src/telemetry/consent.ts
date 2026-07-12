import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPiZaiStateDir } from "../storage/state-dir.ts";

export type TelemetryConsent = {
	schema: 1;
	optedInAt: number;
};

export function telemetryConsentPath(): string {
	return join(getPiZaiStateDir(), "telemetry.consent.json");
}

export function readTelemetryConsent(): TelemetryConsent | undefined {
	const path = telemetryConsentPath();
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as TelemetryConsent;
		return parsed?.schema === 1 && typeof parsed.optedInAt === "number" ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function writeTelemetryConsent(now = Date.now()): void {
	const path = telemetryConsentPath();
	writeFileSync(
		path,
		`${JSON.stringify({ schema: 1, optedInAt: now } satisfies TelemetryConsent, null, 2)}\n`,
		"utf-8",
	);
}

export function clearTelemetryConsent(): void {
	const path = telemetryConsentPath();
	if (existsSync(path)) rmSync(path, { force: true });
}

export function hasTelemetryConsent(): boolean {
	return readTelemetryConsent() !== undefined;
}
