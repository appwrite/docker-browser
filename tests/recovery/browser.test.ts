import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// procps is not in the image, so Chromium is found by walking /proc. The shell
// running this is skipped because its own cmdline contains the pattern too.
const KILL_CHROMIUM = [
	"for p in /proc/[0-9]*; do",
	'  pid="${p##*/}";',
	'  [ "$pid" = "$$" ] && continue;',
	'  grep -qa headless-shell "$p/cmdline" 2>/dev/null && kill -9 "$pid";',
	"done",
].join("\n");

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
		Bun.spawnSync(["docker", "exec", container, "sh", "-c", KILL_CHROMIUM]);
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
