import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	type CaptureRequest,
	HOST_GATEWAY,
	REMOVAL_TIMEOUT_MS,
	Status,
	TEST_PAGE,
	capture,
	health,
	imageBuilt,
	logs,
	removeContainer,
	startContainer,
} from "./container.js";

const MEMORY_BUDGET_EXCEEDED =
	"Page exceeded the memory budget and was closed.";
const CAPTURE_EVICTED =
	"Capture was closed to keep the browser within its memory budget. Retry after the Retry-After delay.";
const MEMORY_BUDGET_EXCEEDED_LOG = "Memory budget exceeded";
const DEFAULT_RETRY_AFTER = 5;
const DRAIN_MS = 2_000;
const UNHEALTHY_DEADLINE_MS = 10_000;

async function healthAfterDrain(port: number): Promise<number> {
	await Bun.sleep(DRAIN_MS + 500);
	return health(port);
}

async function waitForUnhealthy(port: number): Promise<number> {
	const deadline = Date.now() + UNHEALTHY_DEADLINE_MS;
	let status = await health(port);
	while (status !== Status.Unavailable && Date.now() < deadline) {
		await Bun.sleep(250);
		status = await health(port);
	}
	return status;
}

describe.skipIf(!imageBuilt)("E2E Tests - memory budget", () => {
	const NAME = "appwrite-browser-memory-budget";
	const PORT = 3001;
	const GROWTH_DELAY_MS = 3_500;
	const GROWTH_INTERVAL_MS = 100;
	const GROWTH_CHUNK_BYTES = 16 * 1024 * 1024;
	// The page waits out the guard's 3-second solitude window, then grows in
	// steps the 100 ms guard poll sees long before the kernel OOM-kills it.
	// A raster spike crosses budget and limit between two polls too often.
	let page: ReturnType<typeof Bun.serve>;
	let request: CaptureRequest;

	beforeAll(async () => {
		page = Bun.serve({
			port: 0,
			hostname: "0.0.0.0",
			fetch: () =>
				new Response(
					`<!DOCTYPE html><html><body><script>
						const chunks = [];
						setTimeout(() => setInterval(() => {
							chunks.push(new Uint8Array(${GROWTH_CHUNK_BYTES}).fill(1));
						}, ${GROWTH_INTERVAL_MS}), ${GROWTH_DELAY_MS});
					</script></body></html>`,
					{ headers: { "Content-Type": "text/html" } },
				),
		});
		request = {
			url: `http://${HOST_GATEWAY}:${page.port}/`,
			sleep: 30000,
			timeout: 60000,
		};
		await startContainer(NAME, PORT, {
			ALLOWED_HOSTS: HOST_GATEWAY,
		});
	}, 60_000);

	afterAll(() => {
		page?.stop(true);
		removeContainer(NAME);
	}, REMOVAL_TIMEOUT_MS);
	test("should fail a page that crosses the budget alone with 507 and keep Chromium up", async () => {
		expect(await health(PORT)).toBe(Status.Ok);

		const outcome = await capture(PORT, request);

		expect(outcome.status).toBe(Status.InsufficientStorage);
		expect(outcome.contentType).toBe("application/json");
		expect(outcome.retryAfter).toBeNull();
		expect(outcome.error).toBe(MEMORY_BUDGET_EXCEEDED);

		expect(await healthAfterDrain(PORT)).toBe(Status.Ok);
		expect(logs(NAME)).toContain(MEMORY_BUDGET_EXCEEDED_LOG);
	}, 90_000);
});

describe.skipIf(!imageBuilt)("E2E Tests - memory baseline over budget", () => {
	const NAME = "appwrite-browser-memory-baseline";
	const PORT = 3005;
	const request: CaptureRequest = { url: TEST_PAGE, sleep: 2000 };

	beforeAll(async () => {
		// Idle Chromium alone is over 5% of 1 GiB.
		await startContainer(NAME, PORT, { MEMORY_BUDGET: "0.05" });
	}, 60_000);

	afterAll(() => {
		removeContainer(NAME);
	}, REMOVAL_TIMEOUT_MS);

	test("should evict a capture the page did not push over the budget and report the idle browser unhealthy", async () => {
		const outcome = await capture(PORT, request);

		expect(outcome.status).toBe(Status.Unavailable);
		expect(outcome.contentType).toBe("application/json");
		expect(outcome.retryAfter).toBe(String(DEFAULT_RETRY_AFTER));
		expect(outcome.error).toBe(CAPTURE_EVICTED);

		expect(await waitForUnhealthy(PORT)).toBe(Status.Unavailable);
		expect(logs(NAME)).toContain(MEMORY_BUDGET_EXCEEDED_LOG);
	}, 60_000);
});
