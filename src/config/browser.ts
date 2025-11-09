import { chromium } from "playwright-core";
import type { BrowserContextOptions } from "playwright-core";

export const defaultContext: BrowserContextOptions = {
	viewport: {
		width: 1280,
		height: 720,
	},
};

console.log("Chromium starting...");

export const browser = await chromium.launch({
	args: ["--remote-debugging-port=9222"],
	executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});

console.log("Chromium started!");
