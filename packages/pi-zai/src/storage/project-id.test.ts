import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearLocalProjectSecret, loadOrCreateLocalSecret, localSecretPath, projectIdForCwd } from "./project-id.ts";

const AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
const temporaryDirectories: string[] = [];
const previousAgentDir = process.env[AGENT_DIR_ENV];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
	if (previousAgentDir === undefined) {
		delete process.env[AGENT_DIR_ENV];
	} else {
		process.env[AGENT_DIR_ENV] = previousAgentDir;
	}
});

function withAgentDir(): string {
	const directory = mkdtempSync(join(tmpdir(), "pi-zai-agent-"));
	temporaryDirectories.push(directory);
	process.env[AGENT_DIR_ENV] = directory;
	return directory;
}

describe("projectIdForCwd", () => {
	it("is stable for the same cwd and local secret", () => {
		withAgentDir();
		const cwd = mkdtempSync(join(tmpdir(), "pi-zai-project-"));
		temporaryDirectories.push(cwd);

		expect(projectIdForCwd(cwd)).toBe(projectIdForCwd(cwd));
		expect(projectIdForCwd(cwd)).toHaveLength(16);
	});

	it("changes when the local secret is rotated", () => {
		withAgentDir();
		const cwd = mkdtempSync(join(tmpdir(), "pi-zai-project-"));
		temporaryDirectories.push(cwd);

		const before = projectIdForCwd(cwd);
		clearLocalProjectSecret();
		const after = projectIdForCwd(cwd);

		expect(before).not.toBe(after);
	});

	it("differs across installs with different local secrets", () => {
		const cwd = mkdtempSync(join(tmpdir(), "pi-zai-project-"));
		temporaryDirectories.push(cwd);

		withAgentDir();
		const first = projectIdForCwd(cwd);

		withAgentDir();
		const second = projectIdForCwd(cwd);

		expect(first).not.toBe(second);
	});

	it("writes the local secret with restricted permissions", () => {
		withAgentDir();
		loadOrCreateLocalSecret();

		const secret = readFileSync(localSecretPath());
		expect(secret.length).toBeGreaterThanOrEqual(32);
	});
});
