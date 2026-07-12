import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export function getPiZaiStateDir(): string {
	const directory = join(getAgentDir(), "state", "pi-zai");
	mkdirSync(directory, { recursive: true });
	return directory;
}
