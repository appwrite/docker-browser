import { describe, expect, mock, test } from "bun:test";

type FakeBrowser = {
	isConnected: () => boolean;
	disconnect: () => void;
};

function fakeBrowser(): FakeBrowser {
	let alive = true;

	return {
		isConnected: () => alive,
		disconnect: () => {
			alive = false;
		},
	};
}

let launchCount = 0;
let launchImpl: () => Promise<FakeBrowser> = async () => fakeBrowser();

mock.module("playwright-core", () => ({
	chromium: {
		launch: () => {
			launchCount++;
			return launchImpl();
		},
	},
}));

const { getBrowser } = await import("../../src/config/browser");

describe("getBrowser", () => {
	test("should reuse the instance while it is connected", async () => {
		const before = launchCount;
		const first = await getBrowser();
		const second = await getBrowser();

		expect(second).toBe(first);
		expect(launchCount).toBe(before);
	});

	test("should relaunch once it disconnects", async () => {
		const first = (await getBrowser()) as unknown as FakeBrowser;
		first.disconnect();

		const second = await getBrowser();

		expect(second).not.toBe(first);
		expect(second.isConnected()).toBe(true);
	});

	test("should share one relaunch between concurrent callers", async () => {
		const current = (await getBrowser()) as unknown as FakeBrowser;
		current.disconnect();

		let release: (browser: FakeBrowser) => void = () => {};
		launchImpl = () =>
			new Promise((resolve) => {
				release = resolve;
			});

		const before = launchCount;
		const one = getBrowser();
		const two = getBrowser();
		release(fakeBrowser());

		expect(await one).toBe(await two);
		expect(launchCount).toBe(before + 1);

		launchImpl = async () => fakeBrowser();
	});

	test("should retry after a failed relaunch", async () => {
		const current = (await getBrowser()) as unknown as FakeBrowser;
		current.disconnect();

		launchImpl = () => Promise.reject(new Error("boot failed"));
		await expect(getBrowser()).rejects.toThrow("boot failed");

		launchImpl = async () => fakeBrowser();
		const recovered = await getBrowser();

		expect(recovered.isConnected()).toBe(true);
	});
});
