import { beforeAll, describe, expect, test } from "bun:test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// A public site the first-hop URL check accepts, whose redirect or script
// then sends the browser somewhere private.
const OPEN_REDIRECT = "https://httpbin.org/redirect-to?url=";
const RAW_HTML = "https://httpbin.org/base64/";

// The browser service itself, reachable on loopback inside its container.
const LOOPBACK = "http://127.0.0.1:3000/v1/health";
const METADATA = "http://169.254.169.254/latest/meta-data/";

let httpbinUp = false;

beforeAll(async () => {
	try {
		const response = await fetch(`${OPEN_REDIRECT}https://example.com`, {
			redirect: "manual",
			signal: AbortSignal.timeout(10_000),
		});
		httpbinUp = response.status === 302;
	} catch {
		httpbinUp = false;
	}
	if (!httpbinUp) {
		console.warn("httpbin.org is unreachable; skipping its SSRF checks.");
	}
});

function scriptPage(target: string): string {
	const html = `<script>location.href = ${JSON.stringify(target)};</script>`;
	// httpbin decodes URL-safe base64 but insists on the padding.
	const encoded = Buffer.from(html).toString("base64url");
	return `${RAW_HTML}${encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")}`;
}

async function screenshot(url: string): Promise<Response> {
	return fetch(`${BASE_URL}/v1/screenshots`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, sleep: 1000 }),
	});
}

async function expectBlocked(response: Response): Promise<void> {
	expect(response.status).toBe(403);
	expect(response.headers.get("Content-Type")).toBe("application/json");
	const data = await response.json();
	expect(data.error).toContain("was blocked");
}

describe("E2E Tests - screenshots SSRF", () => {
	test("rejects a private first-hop URL", async () => {
		const response = await screenshot(METADATA);
		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toContain("not publicly routable");
	});

	test("blocks a public open redirect to loopback", async () => {
		if (!httpbinUp) return;
		await expectBlocked(
			await screenshot(`${OPEN_REDIRECT}${encodeURIComponent(LOOPBACK)}`),
		);
	}, 30_000);

	test("blocks a public open redirect to cloud metadata", async () => {
		if (!httpbinUp) return;
		await expectBlocked(
			await screenshot(`${OPEN_REDIRECT}${encodeURIComponent(METADATA)}`),
		);
	}, 30_000);

	test("blocks a public page whose script navigates to loopback", async () => {
		if (!httpbinUp) return;
		await expectBlocked(await screenshot(scriptPage(LOOPBACK)));
	}, 30_000);

	test("blocks a public page whose script navigates through an open redirect", async () => {
		if (!httpbinUp) return;
		await expectBlocked(
			await screenshot(
				scriptPage(`${OPEN_REDIRECT}${encodeURIComponent(LOOPBACK)}`),
			),
		);
	}, 30_000);

	test("still captures https://example.com", async () => {
		const response = await screenshot("https://example.com");
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
	}, 30_000);
});
