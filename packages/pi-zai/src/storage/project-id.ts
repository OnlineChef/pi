import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const SECRET_FILENAME = "local.secret";
const SECRET_BYTES = 32;

export function localSecretPath(): string {
	return join(getAgentDir(), "state", "pi-zai", SECRET_FILENAME);
}

function ensureSecretDir(): void {
	mkdirSync(join(getAgentDir(), "state", "pi-zai"), { recursive: true, mode: 0o700 });
}

export function loadOrCreateLocalSecret(): Buffer {
	const path = localSecretPath();
	if (existsSync(path)) {
		const secret = readFileSync(path);
		if (secret.length >= SECRET_BYTES) {
			return secret.subarray(0, SECRET_BYTES);
		}
	}

	ensureSecretDir();
	const secret = randomBytes(SECRET_BYTES);
	writeFileSync(path, secret, { mode: 0o600 });
	try {
		chmodSync(path, 0o600);
	} catch {}
	return secret;
}

export function clearLocalProjectSecret(): void {
	const path = localSecretPath();
	if (existsSync(path)) {
		rmSync(path, { force: true });
	}
}

function canonicalCwd(cwd: string): string {
	let canonical = resolve(cwd);
	try {
		canonical = realpathSync.native(canonical);
	} catch {}
	return canonical;
}

/** Local-only project hash; never sent to remote telemetry. */
export function projectIdForCwd(cwd: string): string {
	const secret = loadOrCreateLocalSecret();
	return createHmac("sha256", secret)
		.update(`pi-zai:project:${canonicalCwd(cwd)}`)
		.digest("hex")
		.slice(0, 16);
}
