import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const IMAGE = "appwrite/browser:local";
const NAME = "appwrite-browser-memory-budget";
const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

const imageBuilt = Bun.spawnSync(["docker", "image", "inspect", IMAGE]).success;

describe.skipIf(!imageBuilt)("E2E Tests - memory budget", () => {
	beforeAll(async () => {
		Bun.spawnSync(["docker", "rm", "-f", NAME]);
		// Idle Chromium alone is over 5% of 1 GiB, so every capture trips the budget.
		Bun.spawnSync([
			"docker",
			"run",
			"-d",
			"--name",
			NAME,
			"--memory",
			"1g",
			"-e",
			"MEMORY_BUDGET=0.05",
			"-p",
			`${PORT}:3000`,
			IMAGE,
		]);

		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			const health = await fetch(`${BASE_URL}/v1/health`).catch(() => null);
			if (health?.ok) return;
			await Bun.sleep(500);
		}
		throw new Error("Memory budget container did not become healthy.");
	}, 60_000);

	afterAll(() => {
		Bun.spawnSync(["docker", "rm", "-f", NAME]);
	});

	test("should fail a capture over the budget with 507 and keep Chromium up", async () => {
		const capture = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: "https://example.com", sleep: 2000 }),
		});
		expect(capture.status).toBe(507);
		expect(capture.headers.get("Content-Type")).toBe("application/json");
		const data = await capture.json();
		expect(data.error).toBe("Page exceeded the memory budget and was closed.");

		const health = await fetch(`${BASE_URL}/v1/health`);
		expect(health.status).toBe(200);

		const logs = Bun.spawnSync(["docker", "logs", NAME]).stdout.toString();
		expect(logs).toContain("Memory budget exceeded");
	}, 60_000);
});
