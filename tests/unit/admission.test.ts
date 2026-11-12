import { describe, expect, test } from "bun:test";
import {
	Admission,
	type AdmissionOptions,
	CAPACITY_EXCEEDED,
	CapacityError,
	admit,
	capacityResponse,
	createAdmission,
	deriveSlots,
	parseCaptureMemory,
	parsePositiveInteger,
	parseRetryAfter,
} from "../../src/utils/admission.js";
import type { MemoryUsage } from "../../src/utils/memory.js";

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

const options: AdmissionOptions = {
	slots: 2,
	budget: 0.85,
	estimate: 256 * MEBIBYTE,
	retryAfter: 5,
	drain: 0,
};

class Memory {
	used: number;

	constructor(
		used: number,
		private readonly limit: number = GIBIBYTE,
	) {
		this.used = used;
	}

	read = (): MemoryUsage => ({ used: this.used, limit: this.limit });
}

function rejection(admission: Admission): CapacityError {
	try {
		admission.acquire();
	} catch (error) {
		if (error instanceof CapacityError) {
			return error;
		}
		throw error;
	}
	throw new Error("Expected acquire() to throw CapacityError");
}

function captureRequest(): Request {
	return new Request("http://localhost/v1/screenshots", { method: "POST" });
}

describe("Admission slots", () => {
	test("admits up to the slot count, then rejects with CapacityError", () => {
		const admission = new Admission(new Memory(0).read, options);

		admission.acquire();
		admission.acquire();
		expect(admission.inFlight).toBe(2);

		const error = rejection(admission);
		expect(error).toBeInstanceOf(CapacityError);
		expect(error).toBeInstanceOf(Error);
		expect(error.retryAfter).toBe(options.retryAfter);
		expect(error.message).toBe(CAPACITY_EXCEEDED);
		expect(admission.inFlight).toBe(2);
		expect(admission.retryAfter).toBe(options.retryAfter);
	});

	test("frees a slot on release, and a second release frees nothing", () => {
		const admission = new Admission(new Memory(0).read, options);

		const first = admission.acquire();
		admission.acquire();
		first.release();
		first.release();
		expect(admission.inFlight).toBe(1);

		admission.acquire();
		expect(admission.inFlight).toBe(2);
		expect(() => admission.acquire()).toThrow(CapacityError);
	});

	test("enforces only the slot count when memory cannot be read", () => {
		const admission = new Admission(() => null, { ...options, slots: 3 });

		admission.acquire();
		admission.acquire();
		admission.acquire();
		expect(() => admission.acquire()).toThrow(CapacityError);
		expect(admission.inFlight).toBe(3);
	});

	test("admits without bound when slots are infinite and memory unknown", () => {
		const admission = new Admission(() => null, {
			...options,
			slots: Number.POSITIVE_INFINITY,
		});

		for (let index = 0; index < 100; index++) {
			admission.acquire();
		}
		expect(admission.inFlight).toBe(100);
	});
});

describe("Admission memory clause", () => {
	test("rejects when one more capture would cross the budget, even with slots left", () => {
		const memory = new Memory(700 * MEBIBYTE);
		const admission = new Admission(memory.read, { ...options, slots: 4 });

		admission.acquire();
		const error = rejection(admission);
		expect(error.retryAfter).toBe(options.retryAfter);
		expect(admission.inFlight).toBe(1);
	});

	test("always admits an idle browser, however high the usage", () => {
		const memory = new Memory(GIBIBYTE);
		const admission = new Admission(memory.read, { ...options, slots: 4 });

		admission.acquire();
		expect(admission.inFlight).toBe(1);
	});

	test("reads memory on every acquire", () => {
		const memory = new Memory(128 * MEBIBYTE);
		const admission = new Admission(memory.read, { ...options, slots: 4 });

		admission.acquire();
		memory.used = 700 * MEBIBYTE;
		expect(() => admission.acquire()).toThrow(CapacityError);

		memory.used = 128 * MEBIBYTE;
		admission.acquire();
		expect(admission.inFlight).toBe(2);
	});

	test("counts admitted captures that have not grown yet", () => {
		const memory = new Memory(128 * MEBIBYTE);
		const admission = new Admission(memory.read, { ...options, slots: 4 });

		admission.acquire();
		admission.acquire();
		expect(admission.inFlight).toBe(2);

		const error = rejection(admission);
		expect(error.retryAfter).toBe(options.retryAfter);
		expect(admission.inFlight).toBe(2);
	});

	test("admits a capture that lands exactly on the budget", () => {
		const memory = new Memory(200, 1000);
		const admission = new Admission(memory.read, {
			slots: 4,
			budget: 0.5,
			estimate: 100,
			retryAfter: 5,
			drain: 0,
		});

		admission.acquire();
		admission.acquire();
		admission.acquire();
		expect(admission.inFlight).toBe(3);
		expect(() => admission.acquire()).toThrow(CapacityError);
	});

	test("rejects a capture that would land one byte over the budget", () => {
		const memory = new Memory(200, 1000);
		const admission = new Admission(memory.read, {
			slots: 4,
			budget: 0.5,
			estimate: 100,
			retryAfter: 5,
			drain: 0,
		});

		admission.acquire();
		admission.acquire();
		memory.used = 401;
		expect(() => admission.acquire()).toThrow(CapacityError);
		expect(admission.inFlight).toBe(2);
	});
});

describe("Admission health", () => {
	test("is healthy while idle under the budget", () => {
		const admission = new Admission(new Memory(128 * MEBIBYTE).read, options);

		expect(admission.healthy()).toBe(true);
	});

	test("is unhealthy while idle over the budget", () => {
		const memory = new Memory(128 * MEBIBYTE);
		const admission = new Admission(memory.read, options);

		memory.used = 900 * MEBIBYTE;
		expect(admission.healthy()).toBe(false);
	});

	test("is healthy over the budget while a capture is in flight", () => {
		const memory = new Memory(900 * MEBIBYTE);
		const admission = new Admission(memory.read, options);

		const slot = admission.acquire();
		expect(admission.healthy()).toBe(true);

		slot.release();
		expect(admission.healthy()).toBe(false);
	});

	test("stays healthy while a released capture's memory drains", async () => {
		const memory = new Memory(900 * MEBIBYTE);
		const admission = new Admission(memory.read, { ...options, drain: 200 });

		admission.acquire().release();
		expect(admission.healthy()).toBe(true);

		await Bun.sleep(250);
		expect(admission.healthy()).toBe(false);
	});

	test("is healthy when memory cannot be read", () => {
		const admission = new Admission(() => null, options);

		expect(admission.healthy()).toBe(true);
	});
});

describe("deriveSlots", () => {
	const usage: MemoryUsage = { used: 128 * MEBIBYTE, limit: GIBIBYTE };

	test("an explicit CAPTURE_SLOTS wins", () => {
		expect(deriveSlots("3", usage, 0.85, 256 * MEBIBYTE)).toBe(3);
		expect(deriveSlots("3", null, 0.85, 256 * MEBIBYTE)).toBe(3);
	});

	test("rejects an invalid CAPTURE_SLOTS", () => {
		expect(() => deriveSlots("0", usage, 0.85, 256 * MEBIBYTE)).toThrow(
			'CAPTURE_SLOTS must be a positive integer, got "0".',
		);
	});

	test("fits the remaining budget after the startup baseline", () => {
		expect(deriveSlots(undefined, usage, 0.85, 256 * MEBIBYTE)).toBe(2);
	});

	test("is unbounded when memory cannot be read", () => {
		expect(deriveSlots(undefined, null, 0.85, 256 * MEBIBYTE)).toBe(
			Number.POSITIVE_INFINITY,
		);
	});

	test("keeps one slot when the baseline is already over budget", () => {
		expect(
			deriveSlots(
				undefined,
				{ used: 900 * MEBIBYTE, limit: GIBIBYTE },
				0.85,
				256 * MEBIBYTE,
			),
		).toBe(1);
	});
});

describe("environment parsing", () => {
	test("parsePositiveInteger accepts positive integers", () => {
		expect(parsePositiveInteger("SETTING", "12")).toBe(12);
		expect(parsePositiveInteger("SETTING", "1")).toBe(1);
	});

	test("parsePositiveInteger rejects anything that is not a positive integer", () => {
		for (const value of ["", "0", "-1", "1.5", "x", "1e3"]) {
			expect(() => parsePositiveInteger("SETTING", value)).toThrow(
				`SETTING must be a positive integer, got "${value}".`,
			);
		}
	});

	test("parseCaptureMemory reads MiB and defaults to 256 MiB", () => {
		expect(parseCaptureMemory(undefined)).toBe(256 * MEBIBYTE);
		expect(parseCaptureMemory("")).toBe(256 * MEBIBYTE);
		expect(parseCaptureMemory("100")).toBe(100 * MEBIBYTE);
		expect(() => parseCaptureMemory("0")).toThrow(
			'CAPTURE_MEMORY must be a positive integer, got "0".',
		);
	});

	test("parseRetryAfter reads seconds and defaults to 5", () => {
		expect(parseRetryAfter(undefined)).toBe(5);
		expect(parseRetryAfter("")).toBe(5);
		expect(parseRetryAfter("9")).toBe(9);
		expect(() => parseRetryAfter("1.5")).toThrow(
			'RETRY_AFTER must be a positive integer, got "1.5".',
		);
	});
});

describe("capacityResponse", () => {
	test("is a JSON 503 carrying Retry-After", async () => {
		const response = capacityResponse("Busy.", 3);

		expect(response.status).toBe(503);
		expect(response.headers.get("Retry-After")).toBe("3");
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(await response.json()).toEqual({ error: "Busy." });
	});
});

describe("admit", () => {
	test("answers 503 with Retry-After while the only slot is busy", async () => {
		const admission = new Admission(() => null, {
			...options,
			slots: 1,
			retryAfter: 7,
		});
		let calls = 0;
		let finish: (response: Response) => void = () => {};
		const handle = admit(admission, () => {
			calls++;
			return new Promise<Response>((resolve) => {
				finish = resolve;
			});
		});

		const pending = handle(captureRequest());
		const rejected = await handle(captureRequest());

		expect(rejected.status).toBe(503);
		expect(rejected.headers.get("Retry-After")).toBe("7");
		expect(rejected.headers.get("Content-Type")).toBe("application/json");
		expect(await rejected.json()).toEqual({ error: CAPACITY_EXCEEDED });
		expect(calls).toBe(1);
		expect(admission.inFlight).toBe(1);

		finish(new Response("captured"));
		const admitted = await pending;
		expect(admitted.status).toBe(200);
		expect(await admitted.text()).toBe("captured");
		expect(admission.inFlight).toBe(0);
	});

	test("releases the slot when the handler throws", async () => {
		const admission = new Admission(() => null, { ...options, slots: 1 });
		const failing = admit(admission, async () => {
			throw new Error("capture failed");
		});

		await expect(failing(captureRequest())).rejects.toThrow("capture failed");
		expect(admission.inFlight).toBe(0);

		const succeeding = admit(admission, async () => new Response("captured"));
		expect((await succeeding(captureRequest())).status).toBe(200);
		expect(admission.inFlight).toBe(0);
	});

	test("passes the request through to the handler", async () => {
		const admission = new Admission(() => null, options);
		const request = captureRequest();
		const received: Request[] = [];
		const handle = admit(admission, async (incoming) => {
			received.push(incoming);
			return new Response(null, { status: 204 });
		});

		expect((await handle(request)).status).toBe(204);
		expect(received).toHaveLength(1);
		expect(received[0]).toBe(request);
	});
});

describe("createAdmission", () => {
	test("reads slots, capture memory and retry delay from the environment", () => {
		const admission = createAdmission(
			{ CAPTURE_SLOTS: "4", CAPTURE_MEMORY: "100", RETRY_AFTER: "9" },
			() => null,
		);

		expect(admission.retryAfter).toBe(9);
		for (let index = 0; index < 4; index++) {
			admission.acquire();
		}
		const error = rejection(admission);
		expect(error.retryAfter).toBe(9);
		expect(admission.inFlight).toBe(4);
	});

	test("applies CAPTURE_MEMORY to the memory clause", () => {
		const memory = new Memory(600 * MEBIBYTE);
		const admission = createAdmission(
			{ CAPTURE_SLOTS: "4", CAPTURE_MEMORY: "100" },
			memory.read,
		);

		admission.acquire();
		admission.acquire();
		expect(admission.inFlight).toBe(2);
		expect(() => admission.acquire()).toThrow(CapacityError);
	});

	test("treats an empty setting as unset", () => {
		const admission = createAdmission(
			{ CAPTURE_SLOTS: "", CAPTURE_MEMORY: "", RETRY_AFTER: "" },
			() => null,
		);

		expect(admission.retryAfter).toBe(5);
		for (let index = 0; index < 10; index++) {
			admission.acquire();
		}
		expect(admission.inFlight).toBe(10);
	});

	test("throws at startup on an invalid setting", () => {
		expect(() => createAdmission({ CAPTURE_SLOTS: "0" }, () => null)).toThrow(
			"CAPTURE_SLOTS",
		);
		expect(() => createAdmission({ CAPTURE_MEMORY: "x" }, () => null)).toThrow(
			"CAPTURE_MEMORY",
		);
		expect(() => createAdmission({ RETRY_AFTER: "-1" }, () => null)).toThrow(
			"RETRY_AFTER",
		);
	});
});
