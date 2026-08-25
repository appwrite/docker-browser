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

		// The server notices the dead browser asynchronously.
		const deadline = Date.now() + 30_000;
		let down = await fetch(`${BASE_URL}/v1/health`);
		while (down.status !== 503 && Date.now() < deadline) {
			await Bun.sleep(250);
			down = await fetch(`${BASE_URL}/v1/health`);
		}
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

	test("should share one relaunch between concurrent captures", async () => {
		Bun.spawnSync([
			"docker",
			"exec",
			container,
			"sh",
			"-c",
			"kill -9 $(pidof headless-shell)",
		]);

		const deadline = Date.now() + 30_000;
		let health = await fetch(`${BASE_URL}/v1/health`);
		while (health.status !== 503 && Date.now() < deadline) {
			await Bun.sleep(250);
			health = await fetch(`${BASE_URL}/v1/health`);
		}
		expect(health.status).toBe(503);

		const before = Bun.spawnSync(["docker", "logs", container])
			.stdout.toString()
			.split("Chromium disconnected, relaunching...").length;

		const captures = await Promise.all(
			Array.from({ length: 5 }, () =>
				fetch(`${BASE_URL}/v1/screenshots`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ url: "https://example.com" }),
				}),
			),
		);

		for (const capture of captures) {
			expect(capture.status).toBe(200);
		}

		// A broken guard launches one Chromium per request instead of one total.
		const after = Bun.spawnSync(["docker", "logs", container])
			.stdout.toString()
			.split("Chromium disconnected, relaunching...").length;
		expect(after).toBe(before + 1);
	}, 120_000);
});
