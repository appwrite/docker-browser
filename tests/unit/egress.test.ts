import { describe, expect, test } from "bun:test";
import net from "node:net";
import { startEgressGuard } from "../../src/utils/egress.js";
import type { HostResolution } from "../../src/utils/ssrf.js";

const loopbackPublic: HostResolution = {
	status: "public",
	addresses: [{ address: "127.0.0.1", family: 4 }],
};

async function withProcessFaults<T>(
	fn: () => Promise<T>,
): Promise<{ value?: T; error?: unknown; faults: unknown[] }> {
	const faults: unknown[] = [];
	const onException = (error: unknown) => {
		faults.push(error);
	};
	const onRejection = (error: unknown) => {
		faults.push(error);
	};
	process.on("uncaughtException", onException);
	process.on("unhandledRejection", onRejection);
	try {
		const value = await fn();
		// Late stream errors surface on the next ticks.
		await Bun.sleep(50);
		return { value, faults };
	} catch (error) {
		await Bun.sleep(50);
		return { error, faults };
	} finally {
		process.off("uncaughtException", onException);
		process.off("unhandledRejection", onRejection);
	}
}

async function serveRaw(
	write: (socket: net.Socket) => void,
): Promise<{ port: number; close: () => void }> {
	const server = net.createServer((socket) => {
		socket.on("error", () => {});
		socket.once("data", () => write(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		port: (server.address() as net.AddressInfo).port,
		close: () => {
			server.close();
		},
	};
}

function parseHttpResponse(raw: string): {
	status: number;
	message: string;
	body: string;
} | null {
	const split = raw.indexOf("\r\n\r\n");
	if (split === -1) {
		return null;
	}
	const head = raw.slice(0, split);
	const body = raw.slice(split + 4);
	const length = /content-length:\s*(\d+)/i.exec(head);
	if (length && body.length < Number(length[1])) {
		return null;
	}
	const statusLine = head.split("\r\n")[0] ?? "";
	const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/.exec(statusLine);
	if (!match) {
		return null;
	}
	return {
		status: Number(match[1]),
		message: match[2] ?? "",
		body,
	};
}

async function requestThrough(
	guardUrl: string,
	upstreamPort: number,
): Promise<{ status: number; message: string; body: string }> {
	const proxy = new URL(guardUrl);
	return await new Promise((resolve, reject) => {
		const socket = net.connect(
			{ host: proxy.hostname, port: Number(proxy.port) },
			() => {
				socket.write(
					`GET http://upstream.test:${upstreamPort}/ HTTP/1.1\r\nHost: upstream.test:${upstreamPort}\r\nConnection: close\r\n\r\n`,
				);
			},
		);
		const chunks: Buffer[] = [];
		let settled = false;
		const finish = (value: {
			status: number;
			message: string;
			body: string;
		}) => {
			if (settled) return;
			settled = true;
			socket.end();
			resolve(value);
		};
		socket.on("data", (chunk) => {
			chunks.push(chunk);
			const parsed = parseHttpResponse(
				Buffer.concat(chunks).toString("latin1"),
			);
			if (parsed) finish(parsed);
		});
		socket.on("error", reject);
		socket.setTimeout(3_000, () => {
			socket.destroy();
			reject(new Error("client timeout"));
		});
	});
}

async function connectThrough(
	guardUrl: string,
	authority: string,
): Promise<{ statusLine: string; rest: string }> {
	const proxy = new URL(guardUrl);
	return await new Promise((resolve, reject) => {
		const socket = net.connect(
			{ host: proxy.hostname, port: Number(proxy.port) },
			() => {
				socket.write(
					`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`,
				);
			},
		);
		let buf = "";
		socket.on("data", (chunk) => {
			buf += chunk.toString("latin1");
			const split = buf.indexOf("\r\n\r\n");
			if (split !== -1) {
				socket.end();
				resolve({
					statusLine: buf.slice(0, buf.indexOf("\r\n")),
					rest: buf.slice(split + 4),
				});
			}
		});
		socket.on("error", reject);
		socket.on("end", () => {
			if (buf.length === 0) {
				reject(new Error("CONNECT closed without a response"));
				return;
			}
			resolve({
				statusLine: buf.split("\r\n")[0] ?? "",
				rest: "",
			});
		});
		socket.setTimeout(3_000, () => {
			socket.destroy();
			reject(new Error("CONNECT timeout"));
		});
	});
}

describe("egress guard: HTTP forwarding errors", () => {
	test("forwards a normal upstream response", async () => {
		const upstream = await serveRaw((socket) => {
			socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nhi");
		});
		const guard = await startEgressGuard({
			resolver: async () => loopbackPublic,
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				requestThrough(guard.server, upstream.port),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.status).toBe(200);
			expect(value?.body).toBe("hi");
		} finally {
			guard.close();
			upstream.close();
		}
	});

	test("returns 502 when the upstream status message is rejected by the writer", async () => {
		const upstream = await serveRaw((socket) => {
			// A control byte is kept by the client parser and then rejected by
			// writeHead on both the Dockerfile Bun and the CI "latest" Bun.
			socket.end(
				Buffer.from(
					"HTTP/1.1 200 OK\x01\r\nContent-Length: 2\r\n\r\nhi",
					"latin1",
				),
			);
		});
		const guard = await startEgressGuard({
			resolver: async () => loopbackPublic,
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				requestThrough(guard.server, upstream.port),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.status).toBe(502);
		} finally {
			guard.close();
			upstream.close();
		}
	});

	test("returns 502 when the upstream status code is outside 100-999", async () => {
		const upstream = await serveRaw((socket) => {
			socket.end("HTTP/1.1 099 Almost\r\nContent-Length: 0\r\n\r\n");
		});
		const guard = await startEgressGuard({
			resolver: async () => loopbackPublic,
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				requestThrough(guard.server, upstream.port),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.status).toBe(502);
		} finally {
			guard.close();
			upstream.close();
		}
	});

	test("returns 502 when the host resolver rejects", async () => {
		const upstream = await serveRaw((socket) => {
			socket.end("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
		});
		const guard = await startEgressGuard({
			resolver: async () => {
				throw new Error("lookup failed");
			},
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				requestThrough(guard.server, upstream.port),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.status).toBe(502);
		} finally {
			guard.close();
			upstream.close();
		}
	});

	test("keeps serving after an upstream response the writer rejects", async () => {
		const replies = [
			Buffer.from("HTTP/1.1 200 OK\x01\r\nContent-Length: 0\r\n\r\n", "latin1"),
			"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
		];
		const upstream = await serveRaw((socket) => {
			socket.end(replies.shift() ?? "");
		});
		const guard = await startEgressGuard({
			resolver: async () => loopbackPublic,
		});
		try {
			const first = await withProcessFaults(() =>
				requestThrough(guard.server, upstream.port),
			);
			const second = await withProcessFaults(() =>
				requestThrough(guard.server, upstream.port),
			);
			expect(first.error).toBeUndefined();
			expect(first.faults).toEqual([]);
			expect(first.value?.status).toBe(502);
			expect(second.error).toBeUndefined();
			expect(second.faults).toEqual([]);
			expect(second.value?.status).toBe(200);
			expect(second.value?.body).toBe("ok");
		} finally {
			guard.close();
			upstream.close();
		}
	});
});

describe("egress guard: CONNECT errors", () => {
	test("establishes a tunnel to a reachable host", async () => {
		const target = net.createServer((socket) => {
			socket.on("error", () => {});
			socket.write("pong");
			socket.end();
		});
		await new Promise<void>((resolve) =>
			target.listen(0, "127.0.0.1", resolve),
		);
		const port = (target.address() as net.AddressInfo).port;
		const guard = await startEgressGuard({
			resolver: async () => loopbackPublic,
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				connectThrough(guard.server, `upstream.test:${port}`),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.statusLine).toBe("HTTP/1.1 200 Connection Established");
			expect(value?.rest).toBe("pong");
		} finally {
			guard.close();
			target.close();
		}
	});

	test("returns 502 when the host resolver rejects", async () => {
		const guard = await startEgressGuard({
			resolver: async () => {
				throw new Error("lookup failed");
			},
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				connectThrough(guard.server, "upstream.test:443"),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.statusLine).toBe("HTTP/1.1 502 Bad Gateway");
		} finally {
			guard.close();
		}
	});

	test("returns 502 when the destination refuses the connection", async () => {
		const closed = net.createServer();
		await new Promise<void>((resolve) =>
			closed.listen(0, "127.0.0.1", resolve),
		);
		const port = (closed.address() as net.AddressInfo).port;
		await new Promise<void>((resolve, reject) =>
			closed.close((error) => (error ? reject(error) : resolve())),
		);
		const guard = await startEgressGuard({
			resolver: async () => loopbackPublic,
		});
		try {
			const { faults, value, error } = await withProcessFaults(() =>
				connectThrough(guard.server, `upstream.test:${port}`),
			);
			expect(error).toBeUndefined();
			expect(faults).toEqual([]);
			expect(value?.statusLine).toBe("HTTP/1.1 502 Bad Gateway");
		} finally {
			guard.close();
		}
	});
});
