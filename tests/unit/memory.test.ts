import { describe, expect, test } from "bun:test";
import {
	MemoryGuard,
	type MemoryUsage,
	parseMemoryBudget,
} from "../../src/utils/memory.js";

const MEBIBYTE = 1024 * 1024;
const LIMIT = 2048 * MEBIBYTE;
const INTERVAL = 5;
const SETTLE = 100;

class FakeContext {
	closed = 0;

	async close(): Promise<void> {
		this.closed++;
	}
}

function guardWith(usage: { used: number }, reads?: { count: number }) {
	return new MemoryGuard({
		read: (): MemoryUsage => {
			if (reads) reads.count++;
			return { used: usage.used, limit: LIMIT };
		},
		budget: 0.85,
		interval: INTERVAL,
		settle: SETTLE,
	});
}

describe("parseMemoryBudget", () => {
	test("defaults to 85% when unset or empty", () => {
		expect(parseMemoryBudget(undefined)).toBe(0.85);
		expect(parseMemoryBudget("")).toBe(0.85);
	});

	test("accepts a fraction up to 1", () => {
		expect(parseMemoryBudget("0.5")).toBe(0.5);
		expect(parseMemoryBudget("1")).toBe(1);
	});

	test.each(["0", "-0.2", "1.5", "85", "abc"])("rejects %p", (value) => {
		expect(() => parseMemoryBudget(value)).toThrow("MEMORY_BUDGET");
	});
});

describe("MemoryGuard", () => {
	test("leaves captures alone under the budget", async () => {
		const usage = { used: 1500 * MEBIBYTE };
		const guard = guardWith(usage);
		const context = new FakeContext();
		const capture = guard.track(context);

		await Bun.sleep(INTERVAL * 6);

		expect(context.closed).toBe(0);
		expect(capture.exceeded).toBe(false);
		capture.release();
	});

	test("closes only the newest capture once over the budget", async () => {
		const usage = { used: 1500 * MEBIBYTE };
		const guard = guardWith(usage);
		const older = new FakeContext();
		const newer = new FakeContext();
		const olderCapture = guard.track(older);
		const newerCapture = guard.track(newer);

		usage.used = 1900 * MEBIBYTE;
		await Bun.sleep(INTERVAL * 6);

		expect(newer.closed).toBe(1);
		expect(newerCapture.exceeded).toBe(true);
		expect(older.closed).toBe(0);
		expect(olderCapture.exceeded).toBe(false);
		olderCapture.release();
		newerCapture.release();
	});

	test("waits for the settle time before closing the next capture", async () => {
		const usage = { used: 1900 * MEBIBYTE };
		const guard = guardWith(usage);
		const older = new FakeContext();
		const newer = new FakeContext();
		const olderCapture = guard.track(older);
		const newerCapture = guard.track(newer);

		await Bun.sleep(SETTLE / 2);
		expect(newer.closed).toBe(1);
		expect(older.closed).toBe(0);

		await Bun.sleep(SETTLE);
		expect(older.closed).toBe(1);
		expect(olderCapture.exceeded).toBe(true);
		olderCapture.release();
		newerCapture.release();
	});

	test("skips captures that were already released", async () => {
		const usage = { used: 1500 * MEBIBYTE };
		const guard = guardWith(usage);
		const older = new FakeContext();
		const newer = new FakeContext();
		const olderCapture = guard.track(older);
		const newerCapture = guard.track(newer);
		newerCapture.release();

		usage.used = 1900 * MEBIBYTE;
		await Bun.sleep(INTERVAL * 6);

		expect(newer.closed).toBe(0);
		expect(older.closed).toBe(1);
		olderCapture.release();
	});

	test("stops polling once every capture is released", async () => {
		const reads = { count: 0 };
		const guard = guardWith({ used: 1500 * MEBIBYTE }, reads);
		const capture = guard.track(new FakeContext());

		await Bun.sleep(INTERVAL * 4);
		capture.release();
		const afterRelease = reads.count;
		await Bun.sleep(INTERVAL * 6);

		expect(afterRelease).toBeGreaterThan(1);
		expect(reads.count).toBe(afterRelease);
	});

	test("does nothing without a memory limit", async () => {
		const reads = { count: 0 };
		const guard = new MemoryGuard({
			read: () => {
				reads.count++;
				return null;
			},
			budget: 0.85,
			interval: INTERVAL,
		});
		const context = new FakeContext();
		const capture = guard.track(context);

		await Bun.sleep(INTERVAL * 6);

		expect(reads.count).toBe(1);
		expect(context.closed).toBe(0);
		capture.release();
	});
});
