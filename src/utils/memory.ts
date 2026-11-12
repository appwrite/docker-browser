import { readFileSync } from "node:fs";

/**
 * Callers release a capture only after its context has closed, so memory still
 * draining from a closed capture keeps it tracked and the survivor is never
 * mistaken for the only capture.
 */
export enum Closure {
	Evicted = "evicted",
	Exceeded = "exceeded",
}

export interface Capture {
	readonly closure: Closure | null;
	release(): void;
}

export interface Closable {
	close(): Promise<void>;
}

interface Tracked {
	readonly target: Closable;
	readonly usedAtTrack: number;
	closure: Closure | null;
}

export interface MemoryUsage {
	readonly used: number;
	readonly limit: number;
}

export const MEMORY_BUDGET_EXCEEDED =
	"Page exceeded the memory budget and was closed.";

export const CAPTURE_EVICTED =
	"Capture was closed to keep the browser within its memory budget. Retry after the Retry-After delay.";

const CGROUP_PATH = "/sys/fs/cgroup";
const DEFAULT_BUDGET = 0.85;
const POLL_INTERVAL_MS = 100;
export const SETTLE_MS = 1_000;
export const QUIET_MS = 3_000;
const MEBIBYTE = 1024 * 1024;

export function readCgroupMemory(): MemoryUsage | null {
	try {
		const limit = readFileSync(`${CGROUP_PATH}/memory.max`, "utf8").trim();
		if (limit === "max") {
			return null;
		}

		const current = Number(
			readFileSync(`${CGROUP_PATH}/memory.current`, "utf8"),
		);
		const stat = readFileSync(`${CGROUP_PATH}/memory.stat`, "utf8");
		const inactiveFile = Number(/^inactive_file (\d+)$/m.exec(stat)?.[1] ?? 0);

		return { used: current - inactiveFile, limit: Number(limit) };
	} catch {
		return null;
	}
}

export function parseMemoryBudget(value: string | undefined): number {
	if (value === undefined || value === "") {
		return DEFAULT_BUDGET;
	}

	const budget = Number(value);
	if (!(budget > 0 && budget <= 1)) {
		throw new Error(
			`MEMORY_BUDGET must be a fraction of the memory limit between 0 and 1, got "${value}".`,
		);
	}

	return budget;
}

export class MemoryGuard {
	private readonly tracked: Tracked[] = [];
	private readonly enabled: boolean;
	private timer: ReturnType<typeof setInterval> | null = null;
	private settledAt = 0;
	private soloSince = 0;

	constructor(
		private readonly read: () => MemoryUsage | null,
		private readonly budget: number,
	) {
		this.enabled = read() !== null;
	}

	track(target: Closable): Capture {
		const entry: Tracked = {
			target,
			usedAtTrack: this.read()?.used ?? Number.POSITIVE_INFINITY,
			closure: null,
		};
		this.tracked.push(entry);
		this.soloSince = Date.now();

		if (this.enabled && this.timer === null) {
			this.timer = setInterval(() => this.check(), POLL_INTERVAL_MS);
		}

		return {
			get closure() {
				return entry.closure;
			},
			release: () => {
				const index = this.tracked.indexOf(entry);
				if (index !== -1) {
					this.tracked.splice(index, 1);
					this.soloSince = Date.now();
				}

				if (this.tracked.length === 0 && this.timer !== null) {
					clearInterval(this.timer);
					this.timer = null;
				}
			},
		};
	}

	private check(): void {
		const now = Date.now();
		if (now < this.settledAt) {
			return;
		}

		const usage = this.read();
		if (usage === null) {
			return;
		}

		const budget = usage.limit * this.budget;
		if (usage.used < budget) {
			return;
		}

		let newest: Tracked | undefined;
		for (let index = this.tracked.length - 1; index >= 0; index--) {
			if (this.tracked[index].closure === null) {
				newest = this.tracked[index];
				break;
			}
		}

		if (newest === undefined) {
			return;
		}

		const exceeded =
			this.tracked.length === 1 &&
			now - this.soloSince >= QUIET_MS &&
			newest.usedAtTrack < budget;
		newest.closure = exceeded ? Closure.Exceeded : Closure.Evicted;
		this.settledAt = now + SETTLE_MS;

		console.log(
			`Memory budget exceeded: ${Math.round(usage.used / MEBIBYTE)} of ${Math.round(usage.limit / MEBIBYTE)} MiB, closing the newest capture (${newest.closure})`,
		);

		newest.target.close().catch(() => {});
	}
}

export const memoryGuard = new MemoryGuard(
	readCgroupMemory,
	parseMemoryBudget(process.env.MEMORY_BUDGET),
);
