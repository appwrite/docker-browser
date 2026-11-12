import type {
	BrowserContext,
	BrowserContextOptions,
	PageScreenshotOptions,
} from "playwright-core";
import { admission, defaultContext, getBrowser } from "../config";
import { screenshotSchema } from "../schemas";
import { closeOnAbort } from "../utils/abort.js";
import {
	type EgressGuard,
	routeHeaders,
	startEgressGuard,
	watchNavigations,
} from "../utils/egress.js";
import { failureResponse } from "../utils/failure.js";
import { type Capture, memoryGuard } from "../utils/memory.js";
import { assertAllowedUrl } from "../utils/ssrf.js";

export async function handleScreenshotsRequest(
	request: Request,
): Promise<Response> {
	let context: BrowserContext | undefined;
	let guard: EgressGuard | undefined;
	let capture: Capture | undefined;

	try {
		const json = await request.json();
		const body = screenshotSchema.parse(json);

		// Fails fast with a clear error; the egress guard below is what enforces
		// the policy on every connection the browser makes.
		await assertAllowedUrl(body.url);

		guard = await startEgressGuard();

		const contextOptions: BrowserContextOptions = {
			...defaultContext,
			colorScheme: body.theme,
			viewport: body.viewport || defaultContext.viewport,
			deviceScaleFactor: body.deviceScaleFactor,
			hasTouch: body.hasTouch,
			isMobile: body.isMobile,
			proxy: { server: guard.server, bypass: guard.bypass },
		};

		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;
		if (body.geolocation) contextOptions.geolocation = body.geolocation;

		const browser = await getBrowser();
		context = await browser.newContext(contextOptions);
		capture = memoryGuard.track(context);
		closeOnAbort(request.signal, context);

		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		const page = await context.newPage();
		const navigations = watchNavigations(page, guard);
		const targetOrigin = new URL(body.url).origin;

		await routeHeaders(page, targetOrigin, body.headers || {});

		try {
			await page.goto(body.url, {
				waitUntil: body.waitUntil,
				timeout: body.timeout,
			});
		} catch (error) {
			navigations.assertAllowed();
			throw error;
		}

		if (body.sleep > 0) {
			await page.waitForTimeout(body.sleep);
		}

		navigations.assertAllowed();

		const screenshotOptions = {
			type: body.format as PageScreenshotOptions["type"],
			fullPage: body.fullPage,
		} as PageScreenshotOptions;

		// Quality is only supported for JPEG and WebP formats
		if (body.format === "jpeg" || body.format === "webp") {
			screenshotOptions.quality = body.quality;
		}

		if (body.clip) {
			screenshotOptions.clip = body.clip;
		}

		const screen = await page.screenshot(screenshotOptions);

		// A script can start a navigation while the screenshot is taken.
		navigations.assertAllowed();

		return new Response(Buffer.from(screen), {
			headers: {
				"Content-Type": `image/${body.format}`,
			},
		});
	} catch (error) {
		return failureResponse(
			error,
			capture?.closure ?? null,
			admission.retryAfter,
		);
	} finally {
		await context?.close().catch((error: unknown) => {
			console.error("Could not close the browser context:", error);
		});
		capture?.release();
		guard?.close();
	}
}
