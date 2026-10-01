import type {
	BrowserContext,
	BrowserContextOptions,
	PageScreenshotOptions,
} from "playwright-core";
import { defaultContext, getBrowser } from "../config";
import { screenshotSchema } from "../schemas";
import {
	BlockedNavigationError,
	type EgressGuard,
	startEgressGuard,
	watchNavigations,
} from "../utils/egress.js";
import { assertPublicUrl } from "../utils/ssrf.js";

export async function handleScreenshotsRequest(
	req: Request,
): Promise<Response> {
	let context: BrowserContext | undefined;
	let guard: EgressGuard | undefined;

	try {
		const json = await req.json();
		const body = screenshotSchema.parse(json);

		// Fails fast with a clear error; the egress guard below is what enforces
		// the policy on every connection the browser makes.
		await assertPublicUrl(body.url);

		guard = await startEgressGuard();

		// Build context options
		const contextOptions: BrowserContextOptions = {
			...defaultContext,
			colorScheme: body.theme,
			viewport: body.viewport || defaultContext.viewport,
			deviceScaleFactor: body.deviceScaleFactor,
			hasTouch: body.hasTouch,
			isMobile: body.isMobile,
			proxy: { server: guard.server, bypass: guard.bypass },
		};

		// Add optional context options
		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;
		if (body.geolocation) contextOptions.geolocation = body.geolocation;

		const browser = await getBrowser();
		context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		const page = await context.newPage();
		const navigations = watchNavigations(page, guard);
		const targetOrigin = new URL(body.url).origin;

		// Override headers only for the target origin
		await page.route("**/*", async (route, request) => {
			if (new URL(request.url()).origin === targetOrigin) {
				return await route.continue({
					headers: {
						...request.headers(),
						...(body.headers || {}),
					},
				});
			}

			return await route.continue({ headers: request.headers() });
		});

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

		// Build screenshot options
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
		const message = error instanceof Error ? error.message : "Unknown error";
		return new Response(JSON.stringify({ error: message }), {
			status: error instanceof BlockedNavigationError ? 403 : 400,
			headers: { "Content-Type": "application/json" },
		});
	} finally {
		await context?.close();
		guard?.close();
	}
}
