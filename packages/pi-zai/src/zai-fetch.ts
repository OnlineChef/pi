import { Agent, type RequestInit as UndiciRequestInit, fetch as undiciFetch } from "undici";

let ipv4Agent: Agent | undefined;
let fetchPatchInstalled = false;

function getIpv4Agent(): Agent {
	if (!ipv4Agent) {
		ipv4Agent = new Agent({ connect: { family: 4, autoSelectFamily: false } });
	}
	return ipv4Agent;
}

/** True for Z.AI API hosts where a broken local IPv6 path causes ECONNRESET. */
export function isZaiApiHost(hostname: string): boolean {
	return hostname === "api.z.ai" || hostname.endsWith(".z.ai");
}

type UndiciFetchInput = Parameters<typeof undiciFetch>[0];
type FetchInput = string | URL | Request;

function resolveRequestUrl(input: FetchInput): string | undefined {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

/** Fetch api.z.ai over IPv4. Avoids broken AAAA paths that make Node's default fetch fail. */
export async function zaiFetch(input: FetchInput, init?: RequestInit): Promise<Response> {
	try {
		return (await undiciFetch(input as unknown as UndiciFetchInput, {
			...(init as UndiciRequestInit | undefined),
			dispatcher: getIpv4Agent(),
		})) as unknown as Promise<Response>;
	} catch (error) {
		if (!isTransientConnectError(error)) {
			throw error;
		}
		return (await undiciFetch(input as unknown as UndiciFetchInput, {
			...(init as UndiciRequestInit | undefined),
			dispatcher: getIpv4Agent(),
		})) as unknown as Promise<Response>;
	}
}

function isTransientConnectError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error.cause as { code?: string } | undefined)?.code;
	if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ENETUNREACH") {
		return true;
	}
	return /fetch failed|socket hang up|reset before headers/i.test(error.message);
}

/**
 * Route global fetch for Z.AI hosts through {@link zaiFetch} so pi-ai provider
 * traffic and extension probes share the same IPv4-first transport.
 */
export function installZaiIpv4Fetch(): void {
	if (fetchPatchInstalled) return;
	fetchPatchInstalled = true;

	const nativeFetch = globalThis.fetch.bind(globalThis);
	globalThis.fetch = (input: FetchInput, init?: RequestInit): Promise<Response> => {
		const href = resolveRequestUrl(input);
		if (href) {
			try {
				if (isZaiApiHost(new URL(href).hostname)) {
					return zaiFetch(input, init);
				}
			} catch {
				// fall through to native fetch
			}
		}
		return nativeFetch(input, init);
	};
}
