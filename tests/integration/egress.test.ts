import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import dgram from "node:dgram";
import { type Browser, type LaunchOptions, chromium } from "playwright-core";
import {
	BlockedNavigationError,
	type EgressGuard,
	egressBrowserArgs,
	startEgressGuard,
	watchNavigations,
} from "../../src/utils/egress.js";
import { type HostResolution, resolveHost } from "../../src/utils/ssrf.js";

// Stands in for an attacker's public site. It is served from loopback, so the
// test resolver vouches for this one name; everything else resolves for real.
const PUBLIC_HOST = "attacker.test";

let browser: Browser;
let fallbackGuard: EgressGuard;
let internalHits: string[] = [];
let internal: ReturnType<typeof Bun.serve>;
let attacker: ReturnType<typeof Bun.serve>;
let secretUrl: string;

function attackerUrl(path: string, to?: string): string {
	const url = new URL(`http://${PUBLIC_HOST}:${attacker.port}${path}`);
	if (to) url.searchParams.set("to", to);
	return url.toString();
}

function html(body: string): Response {
	return new Response(`<!DOCTYPE html><html><body>${body}</body></html>`, {
		headers: { "Content-Type": "text/html" },
	});
}

function testResolver(
	overrides: Record<string, () => HostResolution> = {},
): (host: string) => Promise<HostResolution> {
	return async (host) => {
		const override = overrides[host];
		if (override) return override();
		if (host === PUBLIC_HOST) {
			return {
				status: "public",
				addresses: [{ address: "127.0.0.1", family: 4 }],
			};
		}
		return resolveHost(host);
	};
}

async function capture(
	url: string,
	resolver = testResolver(),
	settleMs = 1_000,
): Promise<{ text: string; error: unknown; guard: EgressGuard }> {
	const guard = await startEgressGuard({ resolver });
	const context = await browser.newContext({
		proxy: { server: guard.server, bypass: guard.bypass },
	});
	try {
		const page = await context.newPage();
		const navigations = watchNavigations(page, guard);
		let error: unknown;
		try {
			try {
				await page.goto(url, { timeout: 10_000 });
			} catch (gotoError) {
				navigations.assertAllowed();
				throw gotoError;
			}
			await page.waitForTimeout(settleMs);
			navigations.assertAllowed();
		} catch (caught) {
			error = caught;
		}
		const text = await page
			.evaluate(() => document.documentElement.outerHTML)
			.catch(() => "");
		return { text, error, guard };
	} finally {
		await context.close();
		guard.close();
	}
}

beforeAll(async () => {
	internal = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(req) {
			internalHits.push(req.url);
			return html("<h1>INTERNAL SECRET</h1>");
		},
	});
	secretUrl = `http://127.0.0.1:${internal.port}/secret`;

	attacker = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(req) {
			const url = new URL(req.url);
			const to = url.searchParams.get("to") ?? "";
			switch (url.pathname) {
				case "/redirect":
					return new Response(null, { status: 302, headers: { Location: to } });
				case "/js":
					return html(
						`<script>location.href = ${JSON.stringify(to)};</script>`,
					);
				case "/js-after-load":
					return html(
						`<h1>harmless</h1><script>setTimeout(() => { location.replace(${JSON.stringify(to)}); }, 200);</script>`,
					);
				case "/iframe":
					return html(`<iframe src=${JSON.stringify(to)}></iframe>`);
				case "/subresources":
					return html(
						`<img src=${JSON.stringify(to)}><script src=${JSON.stringify(to)}></script><script>fetch(${JSON.stringify(to)}, { mode: "no-cors" }).catch(() => {});</script>`,
					);
				case "/websocket":
					return html(
						`<script>new WebSocket(${JSON.stringify(to.replace(/^http/, "ws"))});</script>`,
					);
				case "/popup":
					return html(`<script>window.open(${JSON.stringify(to)});</script>`);
				default:
					return html("<h1>attacker page</h1>");
			}
		},
	});

	fallbackGuard = await startEgressGuard({ shared: true });
	const options: LaunchOptions = {
		args: egressBrowserArgs,
		proxy: { server: fallbackGuard.server, bypass: fallbackGuard.bypass },
		...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
			? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
			: { channel: "chrome" }),
	};
	browser = await chromium.launch(options);
});

afterAll(async () => {
	await browser?.close();
	fallbackGuard?.close();
	internal?.stop(true);
	attacker?.stop(true);
});

describe("egress guard: HTTP redirects", () => {
	const privateTargets = () => [
		secretUrl,
		`http://localhost:${internal.port}/secret`,
		`https://127.0.0.1:${internal.port}/secret`,
		`http://[::1]:${internal.port}/secret`,
		`http://[::ffff:127.0.0.1]:${internal.port}/secret`,
		"http://169.254.169.254/latest/meta-data/",
		"http://10.0.0.1/",
	];

	test("blocks a public open redirect to private, loopback and link-local targets", async () => {
		for (const target of privateTargets()) {
			internalHits = [];
			const { text, error } = await capture(attackerUrl("/redirect", target));

			expect(error, target).toBeInstanceOf(BlockedNavigationError);
			expect((error as Error).message).toContain("not publicly routable");
			expect(text).not.toContain("INTERNAL SECRET");
			expect(internalHits).toEqual([]);
		}
	}, 120_000);

	test("blocks a chain of redirects that ends on a private target", async () => {
		internalHits = [];
		const hop = attackerUrl("/redirect", secretUrl);
		const { text, error } = await capture(attackerUrl("/redirect", hop));

		expect(error).toBeInstanceOf(BlockedNavigationError);
		expect(text).not.toContain("INTERNAL SECRET");
		expect(internalHits).toEqual([]);
	}, 30_000);
});

describe("egress guard: script navigations", () => {
	test("blocks a JS navigation during load to a private target", async () => {
		internalHits = [];
		const { text, error } = await capture(attackerUrl("/js", secretUrl));

		expect(error).toBeInstanceOf(BlockedNavigationError);
		expect(text).not.toContain("INTERNAL SECRET");
		expect(internalHits).toEqual([]);
	}, 30_000);

	test("blocks a JS navigation after load to cloud metadata", async () => {
		const { text, error } = await capture(
			attackerUrl("/js-after-load", "http://169.254.169.254/latest/meta-data/"),
		);

		expect(error).toBeInstanceOf(BlockedNavigationError);
		expect(text).not.toContain("ami-id");
	}, 30_000);

	test("blocks a JS navigation that goes through a public redirect", async () => {
		internalHits = [];
		const { text, error } = await capture(
			attackerUrl("/js", attackerUrl("/redirect", secretUrl)),
		);

		expect(error).toBeInstanceOf(BlockedNavigationError);
		expect(text).not.toContain("INTERNAL SECRET");
		expect(internalHits).toEqual([]);
	}, 30_000);
});

describe("egress guard: other requests the page makes", () => {
	for (const path of ["/iframe", "/subresources", "/websocket", "/popup"]) {
		test(`never connects to a private target from ${path}`, async () => {
			internalHits = [];
			const { text, guard } = await capture(attackerUrl(path, secretUrl));

			expect(text).not.toContain("INTERNAL SECRET");
			expect(guard.wasBlocked(secretUrl)).toBe(true);
			expect(internalHits).toEqual([]);
		}, 30_000);
	}
});

describe("egress guard: WebRTC", () => {
	test("sends no UDP to a STUN server on a private address", async () => {
		const udp = dgram.createSocket("udp4");
		let packets = 0;
		udp.on("message", () => packets++);
		await new Promise<void>((resolve) => udp.bind(0, "127.0.0.1", resolve));

		const guard = await startEgressGuard({ resolver: testResolver() });
		const context = await browser.newContext({
			proxy: { server: guard.server, bypass: guard.bypass },
		});
		try {
			const page = await context.newPage();
			await page.goto(attackerUrl("/"));
			await page.evaluate(async (port) => {
				const connection = new RTCPeerConnection({
					iceServers: [{ urls: `stun:127.0.0.1:${port}` }],
				});
				connection.createDataChannel("probe");
				await connection.setLocalDescription(await connection.createOffer());
				await new Promise((resolve) => setTimeout(resolve, 2_000));
			}, udp.address().port);
		} finally {
			await context.close();
			guard.close();
			udp.close();
		}

		expect(packets).toBe(0);
	}, 30_000);
});

describe("egress guard: DNS rebinding", () => {
	test("dials the address it checked instead of resolving again", async () => {
		let lookups = 0;
		const resolver = testResolver({
			"rebind.test": () => {
				lookups++;
				return lookups === 1
					? {
							status: "public",
							addresses: [{ address: "127.0.0.1", family: 4 }],
						}
					: { status: "private" };
			},
		});
		const url = `http://rebind.test:${attacker.port}/js?to=${encodeURIComponent(
			`http://rebind.test:${attacker.port}/second-visit`,
		)}`;

		const { text, error } = await capture(url, resolver);

		expect(error).toBeUndefined();
		expect(text).toContain("attacker page");
		expect(lookups).toBe(1);
	}, 30_000);
});

describe("egress guard: public sites", () => {
	test("still captures https://example.com", async () => {
		const { text, error } = await capture("https://example.com", resolveHost);

		expect(error).toBeUndefined();
		expect(text).toContain("Example Domain");
	}, 30_000);

	test("still captures plain-HTTP http://example.com", async () => {
		const { text, error } = await capture("http://example.com", resolveHost);

		expect(error).toBeUndefined();
		expect(text).toContain("Example Domain");
	}, 30_000);
});
