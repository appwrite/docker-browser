import { readFileSync } from "node:fs";

/**
 * Chromium shares one GPU process between pages, so no page's memory can be
 * measured on its own. The guard watches the container's working set instead,
 * the figure the kernel OOM-kills on, and closes the newest capture whenever
 * it crosses the budget. One capture then fails instead of Chromium and every
 * capture running in it.
 */
export interface Capture {
	/** Whether the guard closed this capture to stay within the budget. */
	readonly exceeded: boolean;
	release(): void;
}

interface Closable {
	close(): Promise<void>;
}

interface Tracked {
	readonly target: Closable;
	exceeded: boolean;
}

export interface MemoryUsage {
	readonly used: number;
	readonly limit: number;
}

export const MEMORY_BUDGET_EXCEEDED =
	"Page exceeded the memory budget and was closed.";

const CGROUP_PATH = "/sys/fs/cgroup";
const DEFAULT_BUDGET = 0.85;
const POLL_INTERVAL_MS = 100;
const SETTLE_MS = 1_000;
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

	constructor(
		private readonly read: () => MemoryUsage | null,
		private readonly budget: number,
	) {
		this.enabled = read() !== null;
	}

	track(target: Closable): Capture {
		const entry: Tracked = { target, exceeded: false };
		this.tracked.push(entry);

		if (this.enabled && this.timer === null) {
			this.timer = setInterval(() => this.check(), POLL_INTERVAL_MS);
		}

		return {
			get exceeded() {
				return entry.exceeded;
			},
			release: () => {
				const index = this.tracked.indexOf(entry);
				if (index !== -1) {
					this.tracked.splice(index, 1);
				}

				if (this.tracked.length === 0 && this.timer !== null) {
					clearInterval(this.timer);
					this.timer = null;
				}
			},
		};
	}

	private check(): void {
		if (Date.now() < this.settledAt) {
			return;
		}

		const usage = this.read();
		if (usage === null || usage.used < usage.limit * this.budget) {
			return;
		}

		let newest: Tracked | undefined;
		for (let index = this.tracked.length - 1; index >= 0; index--) {
			if (!this.tracked[index].exceeded) {
				newest = this.tracked[index];
				break;
			}
		}

		if (newest === undefined) {
			return;
		}

		newest.exceeded = true;
		this.settledAt = Date.now() + SETTLE_MS;

		console.log(
			`Memory budget exceeded: ${Math.round(usage.used / MEBIBYTE)} of ${Math.round(usage.limit / MEBIBYTE)} MiB, closing the newest capture`,
		);

		newest.target.close().catch(() => {});
	}
}

export const memoryGuard = new MemoryGuard(
	readCgroupMemory,
	parseMemoryBudget(process.env.MEMORY_BUDGET),
);
