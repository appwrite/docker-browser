import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

describe("E2E Tests - browser recovery", () => {
	test("should report 503 while Chromium is gone and recover on the next capture", async () => {
		await fetch(`${BASE_URL}/v1/test/crash`, { method: "POST" });
		await Bun.sleep(2000);

		const down = await fetch(`${BASE_URL}/v1/health`);
		expect(down.status).toBe(503);

		const capture = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://example.com" }),
		});
		expect(capture.status).toBe(200);

		const up = await fetch(`${BASE_URL}/v1/health`);
		expect(up.status).toBe(200);
	}, 120_000);
});
