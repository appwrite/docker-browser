import { createServer } from "node:http";
import {
	createApp,
	createRouter,
	defineEventHandler,
	toNodeListener,
} from "h3";
import { readValidatedBody } from "h3";
import lighthouseDesktopConfig from "lighthouse/core/config/lr-desktop-config.js";
import lighthouseMobileConfig from "lighthouse/core/config/lr-mobile-config.js";
import { chromium } from "playwright";
import { playAudit } from "playwright-lighthouse";
import { z } from "zod";

const port = process.env.PORT || 3000;

const app = createApp();
const router = createRouter();

console.log("Chromium starting...");
const browser = await chromium.launch({
	args: ["--remote-debugging-port=9222"],
});
console.log("Chromium started!");

app.use(router);

/** @type {Partial<import('playwright').BrowserContext>} defaultContext */
const defaultContext = {
	viewport: {
		width: 1280,
		height: 720,
	},
};

const screenshotSchema = z.object({
	url: z.string().url(),
	theme: z.enum(["light", "dark"]).default("light"),
	headers: z.record(z.string(), z.any()),
});
router.post(
	"/v1/screenshots",
	defineEventHandler(async (event) => {
		const body = await readValidatedBody(event, screenshotSchema.parse);
		const context = await browser.newContext({
			...defaultContext,
			colorScheme: body.theme,
			extraHTTPHeaders: body.headers,
		});
		const page = await context.newPage();
		await page.goto(body.url, {
			waitUntil: 'domcontentloaded',
		});
		await page.waitForFunction(() => {
		  // eslint-disable-next-line
  		return document.fonts.ready
		});
		await page.waitForTimeout(3000); // Safe addition for any extra JS
		const screen = await page.screenshot();
		await context.close();
		return screen;
	}),
);

const lighthouseSchema = z.object({
	url: z.string().url(),
	viewport: z.enum(["mobile", "desktop"]).default("mobile"),
	json: z.boolean().default(true),
	html: z.boolean().default(false),
	csv: z.boolean().default(false),
});
const configs = {
	mobile: lighthouseMobileConfig,
	desktop: lighthouseDesktopConfig,
};
router.post(
	"/v1/reports",
	defineEventHandler(async (event) => {
		const body = await readValidatedBody(event, lighthouseSchema.parse);
		const context = await browser.newContext(defaultContext);
		const page = await context.newPage();
		await page.goto(body.url);
		const results = await playAudit({
			reports: {
				formats: {
					html: body.html,
					json: body.json,
					csv: body.csv,
				},
			},
			config: configs[body.viewport],
			page: page,
			port: 9222,
			thresholds: {
				"best-practices": 0,
				accessibility: 0,
				performance: 0,
				pwa: 0,
				seo: 0,
			},
		});
		await context.close();
		return JSON.parse(results.report);
	}),
);

router.get(
	"/v1/health",
	defineEventHandler(async () => {
		return {
			status: browser.isConnected() ? "ok" : "error",
		};
	}),
);

createServer(toNodeListener(app)).listen(port);

console.log(`Server running on port http://0.0.0.0:${port}`);
