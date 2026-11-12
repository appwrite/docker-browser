import { afterEach, describe, expect, test } from "bun:test";
import {
	type Capture,
	Closure,
	MemoryGuard,
	type MemoryUsage,
	QUIET_MS,
	SETTLE_MS,
	parseMemoryBudget,
} from "../../src/utils/memory.js";

const BUDGET = 0.5;
const LIMIT = 1_000;
const OVER = 600;
const UNDER = 400;
const MARGIN_MS = 400;

class Memory {
	reads = 0;

	constructor(public used: number) {}

	read = (): MemoryUsage => {
		this.reads++;
		return { used: this.used, limit: LIMIT };
	};
}

class Target {
	closes = 0;
	closedAt: number | null = null;

	async close(): Promise<void> {
		this.closes++;
		this.closedAt = Date.now();
	}
}

const captures: Capture[] = [];

function track(guard: MemoryGuard, target: Target): Capture {
	const capture = guard.track(target);
	captures.push(capture);
	return capture;
}

async function waitFor(
	condition: () => boolean,
	timeout: number,
	description: string,
): Promise<void> {
	const deadline = Date.now() + timeout;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out after ${timeout} ms waiting for ${description}`,
			);
		}
		await Bun.sleep(10);
	}
}

afterEach(() => {
	for (const capture of captures.splice(0)) {
		capture.release();
	}
});

describe("MemoryGuard", () => {
	test("closes the newest capture as evicted and spares the older one", async () => {
		const guard = new MemoryGuard(new Memory(OVER).read, BUDGET);
		const older = new Target();
		const newer = new Target();
		const olderCapture = track(guard, older);
		const newerCapture = track(guard, newer);

		expect(olderCapture.closure).toBeNull();
		expect(newerCapture.closure).toBeNull();

		await waitFor(() => newer.closes > 0, 1_000, "the newest capture to close");

		expect(newerCapture.closure).toBe(Closure.Evicted);
		expect(olderCapture.closure).toBeNull();
		expect(older.closes).toBe(0);
	});

	test("evicts a capture left alone inside the quiet window after an eviction", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const survivor = new Target();
		const newer = new Target();
		const survivorCapture = track(guard, survivor);
		const newerCapture = track(guard, newer);

		memory.used = OVER;
		await waitFor(() => newer.closes > 0, 1_000, "the newest capture to close");
		newerCapture.release();

		await waitFor(
			() => survivor.closes > 0,
			SETTLE_MS + 1_500,
			"the survivor to close",
		);

		expect(survivorCapture.closure).toBe(Closure.Evicted);
		expect(newerCapture.closure).toBe(Closure.Evicted);
		expect(newer.closes).toBe(1);
		expect(
			(survivor.closedAt ?? 0) - (newer.closedAt ?? 0),
		).toBeGreaterThanOrEqual(SETTLE_MS - 50);
	});

	test("evicts a capture whose neighbour was released, not closed, inside the quiet window", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const survivor = new Target();
		const survivorCapture = track(guard, survivor);
		const neighbour = track(guard, new Target());

		await Bun.sleep(QUIET_MS + MARGIN_MS);
		neighbour.release();
		memory.used = OVER;

		await waitFor(() => survivor.closes > 0, 1_000, "the survivor to close");

		expect(survivorCapture.closure).toBe(Closure.Evicted);
		expect(neighbour.closure).toBeNull();
	}, 10_000);

	test("marks a capture left alone after the quiet window as exceeded", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const survivor = new Target();
		const newer = new Target();
		const survivorCapture = track(guard, survivor);
		const newerCapture = track(guard, newer);

		memory.used = OVER;
		await waitFor(() => newer.closes > 0, 1_000, "the newest capture to close");
		newerCapture.release();
		memory.used = UNDER;

		await Bun.sleep(QUIET_MS + MARGIN_MS);
		expect(survivor.closes).toBe(0);

		memory.used = OVER;
		await waitFor(() => survivor.closes > 0, 1_000, "the survivor to close");

		expect(survivorCapture.closure).toBe(Closure.Exceeded);
		expect(newerCapture.closure).toBe(Closure.Evicted);
	}, 10_000);

	test("marks a page alone past the quiet window that started under budget as exceeded", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const target = new Target();
		const capture = track(guard, target);

		await Bun.sleep(QUIET_MS + MARGIN_MS);
		expect(target.closes).toBe(0);

		memory.used = OVER;
		await waitFor(() => target.closes > 0, 1_000, "the capture to close");

		expect(capture.closure).toBe(Closure.Exceeded);
		expect(target.closes).toBe(1);
	}, 10_000);

	test("evicts a lone page that grows past the budget before the quiet window ends", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const target = new Target();
		const capture = track(guard, target);

		memory.used = OVER;
		await waitFor(() => target.closes > 0, 1_000, "the capture to close");

		expect(capture.closure).toBe(Closure.Evicted);
	});

	test("evicts a lone page when memory was already over budget at track time", async () => {
		const memory = new Memory(OVER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const target = new Target();
		const capture = track(guard, target);
		memory.used = UNDER;

		await Bun.sleep(QUIET_MS + MARGIN_MS);
		expect(target.closes).toBe(0);

		memory.used = OVER;
		await waitFor(() => target.closes > 0, 1_000, "the capture to close");

		expect(capture.closure).toBe(Closure.Evicted);
	}, 10_000);

	test("counts a closed capture that is not yet released", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const survivor = new Target();
		const newer = new Target();
		const survivorCapture = track(guard, survivor);
		const newerCapture = track(guard, newer);

		memory.used = OVER;
		await waitFor(() => newer.closes > 0, 1_000, "the newest capture to close");
		memory.used = UNDER;

		await Bun.sleep(QUIET_MS + MARGIN_MS);
		expect(survivor.closes).toBe(0);

		memory.used = OVER;
		await waitFor(() => survivor.closes > 0, 1_000, "the survivor to close");

		expect(survivorCapture.closure).toBe(Closure.Evicted);
		expect(newerCapture.closure).toBe(Closure.Evicted);
		expect(newer.closes).toBe(1);
	}, 10_000);

	test("closes nothing while under budget", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const older = new Target();
		const newer = new Target();
		const olderCapture = track(guard, older);
		const newerCapture = track(guard, newer);

		await Bun.sleep(500);

		expect(memory.reads).toBeGreaterThan(1);
		expect(older.closes + newer.closes).toBe(0);
		expect(olderCapture.closure).toBeNull();
		expect(newerCapture.closure).toBeNull();
	});

	test("stops reading memory once every capture is released", async () => {
		const memory = new Memory(UNDER);
		const guard = new MemoryGuard(memory.read, BUDGET);
		const first = track(guard, new Target());
		const second = track(guard, new Target());

		await Bun.sleep(300);
		expect(memory.reads).toBeGreaterThan(1);

		first.release();
		second.release();
		second.release();
		const reads = memory.reads;

		await Bun.sleep(300);
		expect(memory.reads).toBe(reads);
	});
});

describe("parseMemoryBudget", () => {
	test("defaults to 0.85", () => {
		expect(parseMemoryBudget(undefined)).toBe(0.85);
		expect(parseMemoryBudget("")).toBe(0.85);
	});

	test("accepts a fraction of the limit", () => {
		expect(parseMemoryBudget("0.5")).toBe(0.5);
		expect(parseMemoryBudget("1")).toBe(1);
	});

	test("rejects values outside (0, 1]", () => {
		expect(() => parseMemoryBudget("0")).toThrow("MEMORY_BUDGET");
		expect(() => parseMemoryBudget("1.5")).toThrow("MEMORY_BUDGET");
		expect(() => parseMemoryBudget("x")).toThrow("MEMORY_BUDGET");
	});
});
