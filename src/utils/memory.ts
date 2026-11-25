import { readFileSync } from "node:fs";
import { getBrowser, instance } from "../config/browser.js";

/**
 * Chromium shares one GPU process between pages, so no page's memory can be
 * measured on its own. The guard watches the container's working set instead,
 * the figure the kernel OOM-kills on, and restarts Chromium whenever it
 * crosses the budget. Closing pages alone does not hand memory back: a
 * long-lived Chromium stays over the budget once it has grown, so the captures
 * in flight fail and Chromium relaunches, instead of the kernel killing
 * the whole container.
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
	"Chromium exceeded the memory budget and was restarted.";

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
		private readonly restart: () => Promise<void>,
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

		for (const entry of this.tracked) {
			entry.exceeded = true;
		}
		this.settledAt = Date.now() + SETTLE_MS;

		console.log(
			`Memory budget exceeded: ${Math.round(usage.used / MEBIBYTE)} of ${Math.round(usage.limit / MEBIBYTE)} MiB, restarting Chromium`,
		);

		this.restart().catch(() => {});
	}
}

export const memoryGuard = new MemoryGuard(
	readCgroupMemory,
	parseMemoryBudget(process.env.MEMORY_BUDGET),
	async () => {
		await instance.close();
		await getBrowser();
	},
);
