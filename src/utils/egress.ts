import type { LookupAddress } from "node:dns";
import http from "node:http";
import net from "node:net";
import type { Page } from "playwright-core";
import { type HostResolution, resolveHost } from "./ssrf.js";

/**
 * Chromium resolves and connects on its own, so request interception cannot
 * see redirect hops and cannot stop a rebound DNS answer. Instead every
 * browser connection is sent through this local forward proxy: it resolves
 * the destination itself, refuses any address that is not publicly routable,
 * and dials exactly the address it checked.
 */
export interface EgressGuard {
	/** Proxy URL to hand to Chromium. */
	readonly server: string;
	/** Proxy bypass rules: none, loopback included. */
	readonly bypass: string;
	/** Whether a connection to this URL's host and port was refused. */
	wasBlocked(url: string): boolean;
	close(): void;
}

/**
 * WebRTC sends UDP to STUN and TURN servers a page names, straight past the
 * proxy, unless told to use proxied TCP only. headless-shell reads the first
 * switch and Chrome the second.
 */
export const egressBrowserArgs = [
	"--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
	"--webrtc-ip-handling-policy=disable_non_proxied_udp",
];

const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 60_000;

const HOP_BY_HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"proxy-connection",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

const DEFAULT_PORTS: Record<string, number> = {
	"http:": 80,
	"https:": 443,
	"ws:": 80,
	"wss:": 443,
};

function destinationKey(hostname: string, port: number): string {
	return `${hostname.replace(/^\[|\]$/g, "").toLowerCase()}:${port}`;
}

function preferIpv4(addresses: LookupAddress[]): LookupAddress[] {
	return [...addresses].sort((a, b) => a.family - b.family);
}

function connectToAny(
	addresses: LookupAddress[],
	port: number,
): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const attempt = (index: number, lastError?: Error) => {
			const candidate = addresses[index];
			if (!candidate) {
				reject(lastError ?? new Error("No address to connect to."));
				return;
			}
			const socket = net.connect({
				host: candidate.address,
				port,
				family: candidate.family,
			});
			const fail = (error: Error) => {
				socket.destroy();
				attempt(index + 1, error);
			};
			socket.setTimeout(CONNECT_TIMEOUT_MS, () =>
				fail(new Error("Connection timed out.")),
			);
			socket.once("error", fail);
			socket.once("connect", () => {
				socket.setTimeout(0);
				socket.off("error", fail);
				resolve(socket);
			});
		};
		attempt(0);
	});
}

function forwardHeaders(
	headers: http.IncomingHttpHeaders,
): http.OutgoingHttpHeaders {
	const listed = new Set(
		String(headers.connection ?? "")
			.split(",")
			.map((name) => name.trim().toLowerCase())
			.filter(Boolean),
	);
	const forwarded: http.OutgoingHttpHeaders = {};
	for (const [name, value] of Object.entries(headers)) {
		if (value === undefined) continue;
		if (HOP_BY_HOP_HEADERS.has(name) || listed.has(name)) continue;
		forwarded[name] = value;
	}
	return forwarded;
}

function parseAuthority(
	authority: string,
): { hostname: string; port: number } | null {
	if (/[/@?#\s]/.test(authority)) {
		return null;
	}
	let url: URL;
	try {
		url = new URL(`http://${authority}`);
	} catch {
		return null;
	}
	const port = url.port === "" ? 80 : Number(url.port);
	if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
		return null;
	}
	return { hostname: url.hostname, port };
}

/**
 * A guard per capture pins each host to its first answer for the capture, so a
 * page cannot flip a host between public and private mid-capture, and records
 * what it refused. A shared guard outlives captures, so it does neither.
 */
export async function startEgressGuard({
	shared = false,
	resolver = resolveHost,
}: {
	shared?: boolean;
	resolver?: (host: string) => Promise<HostResolution>;
} = {}): Promise<EgressGuard> {
	const blocked = new Set<string>();
	const sockets = new Set<net.Socket>();
	const resolutions = new Map<string, Promise<HostResolution>>();

	const track = (socket: net.Socket) => {
		if (sockets.has(socket)) return;
		sockets.add(socket);
		socket.on("error", () => socket.destroy());
		socket.once("close", () => sockets.delete(socket));
	};

	const resolve = (hostname: string) => {
		const key = hostname.toLowerCase();
		if (shared) {
			return resolver(key);
		}
		let resolution = resolutions.get(key);
		if (!resolution) {
			resolution = resolver(key);
			resolutions.set(key, resolution);
		}
		return resolution;
	};

	const refuse = (hostname: string, port: number) => {
		if (!shared) {
			blocked.add(destinationKey(hostname, port));
		}
	};

	const server = http.createServer(async (req, res) => {
		track(req.socket);
		// Bun stalls on the second absolute-form request of a kept-alive
		// connection, so make the browser open a new one for each request.
		res.setHeader("Connection", "close");

		let target: URL;
		try {
			target = new URL(req.url ?? "");
		} catch {
			res.writeHead(400).end();
			return;
		}
		if (target.protocol !== "http:") {
			res.writeHead(400).end();
			return;
		}

		const port = target.port === "" ? 80 : Number(target.port);
		const resolution = await resolve(target.hostname);
		if (resolution.status === "private") {
			refuse(target.hostname, port);
			res
				.writeHead(403, { "Content-Type": "text/plain" })
				.end("Destination is not publicly routable.");
			return;
		}
		if (resolution.status === "unresolved") {
			res.writeHead(502).end();
			return;
		}

		const [address] = preferIpv4(resolution.addresses);
		const upstream = http.request(
			{
				host: address.address,
				family: address.family,
				port,
				method: req.method,
				path: `${target.pathname}${target.search}`,
				headers: { ...forwardHeaders(req.headers), host: target.host },
			},
			(upstreamRes) => {
				res.writeHead(
					upstreamRes.statusCode ?? 502,
					upstreamRes.statusMessage,
					forwardHeaders(upstreamRes.headers),
				);
				upstreamRes.pipe(res);
			},
		);
		upstream.setTimeout(IDLE_TIMEOUT_MS, () => upstream.destroy());
		res.once("close", () => upstream.destroy());
		upstream.on("error", () => {
			if (res.headersSent) {
				res.destroy();
			} else {
				res.writeHead(502).end();
			}
		});
		req.pipe(upstream);
	});

	// HTTPS, and WebSockets of either scheme, arrive as CONNECT tunnels.
	server.on("connect", async (req, socket: net.Socket, head: Buffer) => {
		track(socket);

		const target = parseAuthority(req.url ?? "");
		if (!target) {
			socket.end("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
			return;
		}

		const resolution = await resolve(target.hostname);
		if (resolution.status === "private") {
			refuse(target.hostname, target.port);
			socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
			return;
		}
		if (resolution.status === "unresolved") {
			socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
			return;
		}

		let upstream: net.Socket;
		try {
			upstream = await connectToAny(
				preferIpv4(resolution.addresses),
				target.port,
			);
		} catch {
			socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
			return;
		}
		if (socket.destroyed) {
			upstream.destroy();
			return;
		}
		track(upstream);
		upstream.once("close", () => socket.destroy());
		socket.once("close", () => upstream.destroy());

		socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
		if (head.length > 0) {
			upstream.write(head);
		}
		upstream.pipe(socket);
		socket.pipe(upstream);
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});

	const { port } = server.address() as net.AddressInfo;

	return {
		server: `http://127.0.0.1:${port}`,
		bypass: "<-loopback>",
		wasBlocked(rawUrl: string) {
			let url: URL;
			try {
				url = new URL(rawUrl);
			} catch {
				return false;
			}
			const port =
				url.port === "" ? DEFAULT_PORTS[url.protocol] : Number(url.port);
			if (port === undefined) {
				return false;
			}
			return blocked.has(destinationKey(url.hostname, port));
		},
		close() {
			server.close();
			for (const socket of sockets) {
				socket.destroy();
			}
		},
	};
}

export class BlockedNavigationError extends Error {}

/**
 * Records every main-frame navigation, including redirect hops and ones a
 * script starts, so a capture can fail with a clear error instead of
 * returning whatever Chromium rendered after the guard refused it.
 */
export function watchNavigations(
	page: Page,
	guard: EgressGuard,
): { assertAllowed(): void } {
	const navigations: string[] = [];

	page.on("request", (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
			navigations.push(request.url());
		}
	});

	return {
		assertAllowed() {
			const refused = navigations.find((url) => guard.wasBlocked(url));
			if (refused) {
				throw new BlockedNavigationError(
					`Navigation to '${refused}' was blocked: the destination is not publicly routable.`,
				);
			}
			if (page.url().startsWith("chrome-error://")) {
				throw new Error("Navigation failed.");
			}
		},
	};
}
