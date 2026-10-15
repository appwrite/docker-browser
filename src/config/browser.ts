import { chromium } from "playwright-core";
import type { Browser, BrowserContextOptions } from "playwright-core";
import { egressBrowserArgs, startEgressGuard } from "../utils/egress.js";

export const defaultContext: BrowserContextOptions = {
	viewport: {
		width: 1280,
		height: 720,
	},
};

// Captures give their context a guard of their own; this one covers anything
// that runs in the default context, such as targets Lighthouse opens.
const fallbackGuard = await startEgressGuard({ shared: true });

function launch(): Promise<Browser> {
	return chromium.launch({
		args: ["--remote-debugging-port=9222", ...egressBrowserArgs],
		proxy: { server: fallbackGuard.server, bypass: fallbackGuard.bypass },
		executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
	});
}

console.log("Chromium starting...");

export let instance = await launch();

console.log("Chromium started!");

let launching: Promise<Browser> | null = null;

// Chromium can die without the server dying too, so relaunch on demand.
export async function getBrowser(): Promise<Browser> {
	if (instance.isConnected()) {
		return instance;
	}

	if (!launching) {
		console.log("Chromium disconnected, relaunching...");
		launching = launch().finally(() => {
			launching = null;
		});
	}

	instance = await launching;

	return instance;
}
