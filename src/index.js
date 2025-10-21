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
	headers: z.record(z.string(), z.any()).optional(),
	sleep: z.number().min(0).max(60000).default(3000),
	// Viewport options
	viewport: z.object({
		width: z.number().min(1).max(3840).default(1280),
		height: z.number().min(1).max(2160).default(720),
	}).optional(),
	// Screenshot options
	format: z.enum(["png", "jpeg", "webp"]).default("png"),
	quality: z.number().min(0).max(100).default(90),
	fullPage: z.boolean().default(false),
	clip: z.object({
		x: z.number().min(0),
		y: z.number().min(0),
		width: z.number().min(1),
		height: z.number().min(1),
	}).optional(),
	// Browser context options
	userAgent: z.string().optional(),
	locale: z.string().optional(),
	timezoneId: z.string().regex(
		/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)\/[A-Za-z_]+$/,
		"Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')"
	).optional(),
	geolocation: z.object({
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
		accuracy: z.number().min(0).optional(),
	}).optional(),
	permissions: z.array(z.enum([
		"geolocation",
		"camera",
		"microphone",
		"notifications",
		"clipboard-read",
		"clipboard-write",
		"payment-handler",
		"midi",
		"usb",
		"serial",
		"bluetooth",
		"persistent-storage",
		"accelerometer",
		"gyroscope",
		"magnetometer",
		"ambient-light-sensor",
		"background-sync",
		"background-fetch",
		"idle-detection",
		"periodic-background-sync",
		"push",
		"speaker-selection",
		"storage-access",
		"top-level-storage-access",
		"window-management",
		"local-fonts",
		"display-capture",
		"nfc",
		"screen-wake-lock",
		"web-share",
		"xr-spatial-tracking"
	])).optional(),
	// Navigation options
	waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded"),
	timeout: z.number().min(0).max(120000).default(30000),
	// Additional options
	deviceScaleFactor: z.number().min(0.1).max(3).default(1),
	hasTouch: z.boolean().default(false),
	isMobile: z.boolean().default(false),
});
router.post(
	"/v1/screenshots",
	defineEventHandler(async (event) => {
		const body = await readValidatedBody(event, screenshotSchema.parse);
		
		// Build context options
		const contextOptions = {
			...defaultContext,
			colorScheme: body.theme,
			viewport: body.viewport || defaultContext.viewport,
			deviceScaleFactor: body.deviceScaleFactor,
			hasTouch: body.hasTouch,
			isMobile: body.isMobile,
		};

		// Add optional context options
		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;
		if (body.geolocation) contextOptions.geolocation = body.geolocation;

		const context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		// await context.tracing.start({ screenshots: true, snapshots: true });

		const page = await context.newPage();

		// Override headers
		await page.route("**/*", async (route, request) => {
			const url = request.url();
			if (url.startsWith("http://appwrite/")) {
				return await route.continue({
					headers: {
						...request.headers(),
						...(body.headers || {}),
					},
				});
			}

			return await route.continue({ headers: request.headers() });
		});

		await page.goto(body.url, {
			waitUntil: body.waitUntil,
			timeout: body.timeout,
		});

		if (body.sleep > 0) {
			await page.waitForTimeout(body.sleep); // Safe addition for any extra JS
		}

		// Build screenshot options
		const screenshotOptions = {
			type: body.format,
			quality: body.quality,
			fullPage: body.fullPage,
		};

		if (body.clip) {
			screenshotOptions.clip = body.clip;
		}

		const screen = await page.screenshot(screenshotOptions);

		// await context.tracing.stop({ path: '/tmp/trace' + Date.now() + '.zip' });

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
	// Additional lighthouse options
	theme: z.enum(["light", "dark"]).default("light"),
	headers: z.record(z.string(), z.any()).optional(),
	userAgent: z.string().optional(),
	locale: z.string().optional(),
	timezoneId: z.string().regex(
		/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)\/[A-Za-z_]+$/,
		"Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')"
	).optional(),
	permissions: z.array(z.enum([
		"geolocation",
		"camera",
		"microphone",
		"notifications",
		"clipboard-read",
		"clipboard-write",
		"payment-handler",
		"midi",
		"usb",
		"serial",
		"bluetooth",
		"persistent-storage",
		"accelerometer",
		"gyroscope",
		"magnetometer",
		"ambient-light-sensor",
		"background-sync",
		"background-fetch",
		"idle-detection",
		"periodic-background-sync",
		"push",
		"speaker-selection",
		"storage-access",
		"top-level-storage-access",
		"window-management",
		"local-fonts",
		"display-capture",
		"nfc",
		"screen-wake-lock",
		"web-share",
		"xr-spatial-tracking"
	])).optional(),
	// Performance thresholds
	thresholds: z.object({
		performance: z.number().min(0).max(100).default(0),
		accessibility: z.number().min(0).max(100).default(0),
		"best-practices": z.number().min(0).max(100).default(0),
		seo: z.number().min(0).max(100).default(0),
		pwa: z.number().min(0).max(100).default(0),
	}).optional(),
	// Navigation options
	waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded"),
	timeout: z.number().min(0).max(120000).default(30000),
});
const configs = {
	mobile: lighthouseMobileConfig,
	desktop: lighthouseDesktopConfig,
};
router.post(
	"/v1/reports",
	defineEventHandler(async (event) => {
		const body = await readValidatedBody(event, lighthouseSchema.parse);
		
		// Build context options
		const contextOptions = {
			...defaultContext,
			colorScheme: body.theme,
		};

		// Add optional context options
		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;

		const context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		const page = await context.newPage();

		// Override headers if provided
		if (body.headers) {
			await page.route("**/*", async (route, request) => {
				const url = request.url();
				if (url.startsWith("http://appwrite/")) {
					return await route.continue({
						headers: {
							...request.headers(),
							...body.headers,
						},
					});
				}
				return await route.continue({ headers: request.headers() });
			});
		}

		await page.goto(body.url, {
			waitUntil: body.waitUntil,
			timeout: body.timeout,
		});

		// Use custom thresholds if provided, otherwise use defaults
		const thresholds = body.thresholds || {
			"best-practices": 0,
			accessibility: 0,
			performance: 0,
			pwa: 0,
			seo: 0,
		};

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
			thresholds,
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
