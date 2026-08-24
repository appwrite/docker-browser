import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function resolveContainer(): string {
	const result = Bun.spawnSync([
		"docker",
		"compose",
		"ps",
		"-q",
		"appwrite-browser",
	]);

	return result.success ? result.stdout.toString().trim() : "";
}

const container = resolveContainer();

describe.skipIf(container === "")("E2E Tests - browser recovery", () => {
	test("should report 503 while Chromium is gone and recover on the next capture", async () => {
		// SIGKILL is what the OOM killer sends in production, where Chromium
		// dies while the server keeps running.
		Bun.spawnSync([
			"docker",
			"exec",
			container,
			"sh",
			"-c",
			"kill -9 $(pidof headless-shell)",
		]);
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
