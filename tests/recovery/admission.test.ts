import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	type CaptureRequest,
	type Outcome,
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

const CAPACITY_EXCEEDED =
	"Browser is at capacity. Retry after the Retry-After delay.";
const MEMORY_BUDGET_EXCEEDED_LOG = "Memory budget exceeded";
const ADMISSION_LOG = /^Admission: (\d+) slots, \d+ MiB per capture$/m;
const DEFAULT_RETRY_AFTER = 5;
const REJECTION_DEADLINE_MS = 2_000;
const CHROMIUM_STARTED_LOG = "Chromium started!";
const ADMISSION_LOG_PREFIX = "Admission:";
const HEAVY_CONCURRENCY = 12;
const HEAVY_STAGGER_MS = 400;
// Each open page holds about 95 MiB of 3840x2160 @3x tiles while the clip
// keeps the screenshot raster small, so load grows in steps the guard sees.
const HEAVY_REQUEST: CaptureRequest = {
	url: TEST_PAGE,
	viewport: { width: 3840, height: 2160 },
	deviceScaleFactor: 3,
	clip: { x: 0, y: 0, width: 640, height: 360 },
	sleep: 8000,
	timeout: 60000,
};
// Mirrors Appwrite\Screenshots\RetryStrategy.
const RETRY_ATTEMPTS = 3;
const RETRY_MAX_DELAY_S = 10;
const RETRY_JITTER = 0.5;

function admissionSlots(name: string): number | null {
	const match = ADMISSION_LOG.exec(logs(name));
	return match === null ? null : Number(match[1]);
}

function statuses(outcomes: Outcome[]): number[] {
	return outcomes.map((outcome) => outcome.status).sort((a, b) => a - b);
}

function expected(accepted: number, rejected: number): number[] {
	return [
		...Array<number>(accepted).fill(Status.Ok),
		...Array<number>(rejected).fill(Status.Unavailable),
	];
}

function expectAccepted(outcomes: Outcome[]): void {
	for (const outcome of outcomes) {
		expect(outcome.contentType).toBe("image/png");
	}
}

function expectRejected(outcomes: Outcome[], retryAfter: number): void {
	for (const outcome of outcomes) {
		expect(outcome.retryAfter).toBe(String(retryAfter));
		expect(outcome.contentType).toBe("application/json");
		expect(outcome.error).toBe(CAPACITY_EXCEEDED);
		expect(outcome.elapsed).toBeLessThan(REJECTION_DEADLINE_MS);
	}
}

function byStatus(outcomes: Outcome[], status: Status): Outcome[] {
	return outcomes.filter((outcome) => outcome.status === status);
}

function retryDelay(outcome: Outcome, attempt: number): number | null {
	if (attempt >= RETRY_ATTEMPTS || outcome.status !== Status.Unavailable) {
		return null;
	}

	const after = Number(outcome.retryAfter);
	if (outcome.retryAfter === null || Number.isNaN(after)) {
		return null;
	}

	if (after > RETRY_MAX_DELAY_S) {
		return null;
	}

	return Math.min(
		RETRY_MAX_DELAY_S,
		after * (1 + RETRY_JITTER * Math.random()),
	);
}

async function captureWithRetries(
	port: number,
	body: CaptureRequest,
): Promise<Outcome[]> {
	const attempts: Outcome[] = [];
	for (let attempt = 1; ; attempt++) {
		const outcome = await capture(port, body);
		attempts.push(outcome);

		const delay = retryDelay(outcome, attempt);
		if (delay === null) {
			return attempts;
		}
		await Bun.sleep(delay * 1000);
	}
}

function staggered<T>(run: () => Promise<T>): Promise<T[]> {
	return Promise.all(
		Array.from({ length: HEAVY_CONCURRENCY }, async (_, index) => {
			await Bun.sleep(index * HEAVY_STAGGER_MS);
			return run();
		}),
	);
}

function count(values: number[]): string {
	const counts = new Map<number, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts]
		.sort(([a], [b]) => a - b)
		.map(([value, times]) => `${times}x${value}`)
		.join(" ");
}

describe.skipIf(!imageBuilt)("E2E Tests - admission slots", () => {
	const NAME = "appwrite-browser-admission-slots";
	const PORT = 3002;
	const SLOTS = 2;
	const RETRY_AFTER = 7;
	const CONCURRENCY = 6;
	const request: CaptureRequest = { url: TEST_PAGE, sleep: 3000 };

	beforeAll(async () => {
		await startContainer(NAME, PORT, {
			CAPTURE_SLOTS: String(SLOTS),
			RETRY_AFTER: String(RETRY_AFTER),
		});
	}, 60_000);

	afterAll(() => {
		removeContainer(NAME);
	}, REMOVAL_TIMEOUT_MS);

	test("should refuse captures beyond the slots with 503 before opening a context", async () => {
		const outcomes = await Promise.all(
			Array.from({ length: CONCURRENCY }, () => capture(PORT, request)),
		);

		expect(statuses(outcomes)).toEqual(expected(SLOTS, CONCURRENCY - SLOTS));
		expectAccepted(byStatus(outcomes, Status.Ok));
		expectRejected(byStatus(outcomes, Status.Unavailable), RETRY_AFTER);

		const retry = await capture(PORT, request);
		expect(retry.status).toBe(Status.Ok);

		expect(await health(PORT)).toBe(Status.Ok);

		const output = logs(NAME);
		expect(output).not.toContain(MEMORY_BUDGET_EXCEEDED_LOG);
		expect(output.indexOf(CHROMIUM_STARTED_LOG)).toBeGreaterThanOrEqual(0);
		expect(output.indexOf(CHROMIUM_STARTED_LOG)).toBeLessThan(
			output.indexOf(ADMISSION_LOG_PREFIX),
		);
	}, 60_000);
});

describe.skipIf(!imageBuilt)("E2E Tests - admission memory", () => {
	const NAME = "appwrite-browser-admission-memory";
	const PORT = 3003;
	const SLOTS = 3;
	const CAPTURE_MEMORY = 1024;
	const request: CaptureRequest = { url: TEST_PAGE, sleep: 3000 };

	beforeAll(async () => {
		await startContainer(NAME, PORT, {
			CAPTURE_SLOTS: String(SLOTS),
			CAPTURE_MEMORY: String(CAPTURE_MEMORY),
		});
	}, 60_000);

	afterAll(() => {
		removeContainer(NAME);
	}, REMOVAL_TIMEOUT_MS);

	test("should refuse a capture whose estimate exceeds the remaining budget", async () => {
		const outcomes = await Promise.all(
			Array.from({ length: SLOTS }, () => capture(PORT, request)),
		);

		expect(statuses(outcomes)).toEqual(expected(1, SLOTS - 1));
		expectAccepted(byStatus(outcomes, Status.Ok));
		expectRejected(byStatus(outcomes, Status.Unavailable), DEFAULT_RETRY_AFTER);
	}, 60_000);
});

describe.skipIf(!imageBuilt)("E2E Tests - admission under heavy load", () => {
	const NAME = "appwrite-browser-admission-heavy";
	const PORT = 3004;
	const CAPTURE_MEMORY = 512;
	const SLOTS = 1;

	beforeAll(async () => {
		await startContainer(NAME, PORT, {
			CAPTURE_MEMORY: String(CAPTURE_MEMORY),
		});
	}, 60_000);

	afterAll(() => {
		removeContainer(NAME);
	}, REMOVAL_TIMEOUT_MS);

	test("should refuse captures that do not fit instead of killing accepted ones with 507", async () => {
		const outcomes = await staggered(() => capture(PORT, HEAVY_REQUEST));

		expect(statuses(outcomes)).toEqual(
			expected(SLOTS, HEAVY_CONCURRENCY - SLOTS),
		);
		expect(byStatus(outcomes, Status.InsufficientStorage)).toHaveLength(0);
		expectAccepted(byStatus(outcomes, Status.Ok));
		expectRejected(byStatus(outcomes, Status.Unavailable), DEFAULT_RETRY_AFTER);

		expect(await health(PORT)).toBe(Status.Ok);
	}, 120_000);
});

describe.skipIf(!imageBuilt)(
	"E2E Tests - admission under heavy load with derived slots and retrying clients",
	() => {
		const NAME = "appwrite-browser-admission-derived";
		const PORT = 3007;

		beforeAll(async () => {
			await startContainer(NAME, PORT, {});
		}, 60_000);

		afterAll(() => {
			removeContainer(NAME);
		}, REMOVAL_TIMEOUT_MS);

		test("should never answer 507 and leave every unfinished request retryable", async () => {
			const clients = await staggered(() =>
				captureWithRetries(PORT, HEAVY_REQUEST),
			);
			const attempts = clients.flat();
			const finals = clients.map((client) => client[client.length - 1]);
			const completed = byStatus(finals, Status.Ok).length;
			const slots = admissionSlots(NAME);

			console.log(
				`Derived slots ${slots}: ${completed}/${HEAVY_CONCURRENCY} completed, attempts ${count(statuses(attempts))}, finals ${count(statuses(finals))}`,
			);

			expect(
				statuses(attempts).filter(
					(status) => status === Status.InsufficientStorage,
				),
			).toEqual([]);
			expect(slots).toBeGreaterThan(1);
			expectAccepted(byStatus(attempts, Status.Ok));
			for (const outcome of finals) {
				if (outcome.status !== Status.Ok) {
					expect(outcome.status).toBe(Status.Unavailable);
					expect(outcome.retryAfter).toBe(String(DEFAULT_RETRY_AFTER));
				}
			}
			expect(completed).toBeGreaterThan(0);

			expect(await health(PORT)).toBe(Status.Ok);
		}, 180_000);
	},
);

describe.skipIf(!imageBuilt)(
	"E2E Tests - admission after an abandoned capture",
	() => {
		const NAME = "appwrite-browser-admission-abandoned";
		const PORT = 3006;
		const ABANDON_AFTER_MS = 2_000;
		const RELEASE_WAIT_MS = 1_000;
		const ABANDONED_LOG = "Capture abandoned by the client";
		const abandoned: CaptureRequest = { url: TEST_PAGE, sleep: 10000 };
		const following: CaptureRequest = { url: TEST_PAGE, sleep: 0 };

		beforeAll(async () => {
			await startContainer(NAME, PORT, { CAPTURE_SLOTS: "1" });
		}, 60_000);

		afterAll(() => {
			removeContainer(NAME);
		}, REMOVAL_TIMEOUT_MS);

		test("should free the slot of a capture whose client went away", async () => {
			const controller = new AbortController();
			const pending = capture(PORT, abandoned, controller.signal).catch(
				(error: unknown) => error,
			);

			await Bun.sleep(ABANDON_AFTER_MS);
			controller.abort();
			expect((await pending) as Error).toHaveProperty("name", "AbortError");

			await Bun.sleep(RELEASE_WAIT_MS);
			const outcome = await capture(PORT, following);

			expect(outcome.status).toBe(Status.Ok);
			expect(outcome.contentType).toBe("image/png");
			expect(logs(NAME)).toContain(ABANDONED_LOG);
		}, 60_000);
	},
);
