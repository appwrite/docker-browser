import {
	type MemoryUsage,
	parseMemoryBudget,
	readCgroupMemory,
} from "./memory.js";
import type { RouteHandler } from "./router.js";
import { Status } from "./status.js";

export const CAPACITY_EXCEEDED =
	"Browser is at capacity. Retry after the Retry-After delay.";

export interface Slot {
	release(): void;
}

export interface AdmissionOptions {
	readonly slots: number;
	readonly budget: number;
	readonly estimate: number;
	readonly retryAfter: number;
	readonly drain: number;
}

const MEBIBYTE = 1024 * 1024;
const DEFAULT_CAPTURE_MEMORY = 256;
const DEFAULT_RETRY_AFTER = 5;
const DRAIN_MS = 2_000;
const POSITIVE_INTEGER = /^\d+$/;

export class CapacityError extends Error {
	constructor(readonly retryAfter: number) {
		super(CAPACITY_EXCEEDED);
	}
}

export class Admission {
	private admitted = 0;
	private releasedAt = Number.NEGATIVE_INFINITY;
	private readonly baseline: number;

	constructor(
		private readonly read: () => MemoryUsage | null,
		private readonly options: AdmissionOptions,
	) {
		this.baseline = read()?.used ?? 0;
	}

	get inFlight(): number {
		return this.admitted;
	}

	get retryAfter(): number {
		return this.options.retryAfter;
	}

	acquire(): Slot {
		if (!this.admits()) {
			throw new CapacityError(this.options.retryAfter);
		}

		this.admitted++;
		let released = false;

		return {
			release: () => {
				if (released) {
					return;
				}
				released = true;
				this.admitted--;
				this.releasedAt = Date.now();
			},
		};
	}

	healthy(): boolean {
		if (
			this.admitted > 0 ||
			Date.now() - this.releasedAt < this.options.drain
		) {
			return true;
		}

		const usage = this.read();
		return usage === null || usage.used < usage.limit * this.options.budget;
	}

	private admits(): boolean {
		if (this.admitted === 0) {
			return true;
		}

		if (this.admitted >= this.options.slots) {
			return false;
		}

		const usage = this.read();
		if (usage === null) {
			return true;
		}

		const { estimate, budget } = this.options;
		const committed = this.baseline + this.admitted * estimate;
		return Math.max(usage.used, committed) + estimate <= usage.limit * budget;
	}
}

function isUnset(value: string | undefined): value is undefined | "" {
	return value === undefined || value === "";
}

export function parsePositiveInteger(name: string, value: string): number {
	const parsed = Number(value);
	if (
		!POSITIVE_INTEGER.test(value) ||
		!Number.isSafeInteger(parsed) ||
		parsed < 1
	) {
		throw new Error(`${name} must be a positive integer, got "${value}".`);
	}

	return parsed;
}

export function parseCaptureMemory(value: string | undefined): number {
	const mebibytes = isUnset(value)
		? DEFAULT_CAPTURE_MEMORY
		: parsePositiveInteger("CAPTURE_MEMORY", value);

	return mebibytes * MEBIBYTE;
}

export function parseRetryAfter(value: string | undefined): number {
	return isUnset(value)
		? DEFAULT_RETRY_AFTER
		: parsePositiveInteger("RETRY_AFTER", value);
}

export function deriveSlots(
	value: string | undefined,
	usage: MemoryUsage | null,
	budget: number,
	estimate: number,
): number {
	if (!isUnset(value)) {
		return parsePositiveInteger("CAPTURE_SLOTS", value);
	}

	if (usage === null) {
		return Number.POSITIVE_INFINITY;
	}

	return Math.max(
		1,
		Math.floor((usage.limit * budget - usage.used) / estimate),
	);
}

export function createAdmission(
	environment: NodeJS.ProcessEnv = process.env,
	read: () => MemoryUsage | null = readCgroupMemory,
): Admission {
	const budget = parseMemoryBudget(environment.MEMORY_BUDGET);
	const estimate = parseCaptureMemory(environment.CAPTURE_MEMORY);
	const slots = deriveSlots(
		environment.CAPTURE_SLOTS,
		read(),
		budget,
		estimate,
	);

	console.log(
		`Admission: ${slots} slots, ${estimate / MEBIBYTE} MiB per capture`,
	);

	return new Admission(read, {
		slots,
		budget,
		estimate,
		retryAfter: parseRetryAfter(environment.RETRY_AFTER),
		drain: DRAIN_MS,
	});
}

export function capacityResponse(message: string, seconds: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status: Status.Unavailable,
		headers: {
			"Content-Type": "application/json",
			"Retry-After": String(seconds),
		},
	});
}

export function admit(
	admission: Admission,
	handler: RouteHandler,
): RouteHandler {
	return async (request: Request): Promise<Response> => {
		let slot: Slot;
		try {
			slot = admission.acquire();
		} catch (error) {
			if (!(error instanceof CapacityError)) {
				throw error;
			}
			console.log(`Capture rejected: ${admission.inFlight} in flight`);
			return capacityResponse(CAPACITY_EXCEEDED, error.retryAfter);
		}

		try {
			return await handler(request);
		} finally {
			slot.release();
		}
	};
}
