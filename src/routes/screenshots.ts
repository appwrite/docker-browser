import type {
	BrowserContext,
	BrowserContextOptions,
	PageScreenshotOptions,
} from "playwright-core";
import { browser, defaultContext } from "../config";
import { screenshotSchema } from "../schemas";

export async function handleScreenshotsRequest(
	req: Request,
): Promise<Response> {
	let context: BrowserContext | undefined;

	try {
		const json = await req.json();
		const body = screenshotSchema.parse(json);

		// Build context options
		const contextOptions: BrowserContextOptions = {
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

		context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

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
			await page.waitForTimeout(body.sleep);
		}

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

		return new Response(Buffer.from(screen), {
			headers: {
				"Content-Type": `image/${body.format}`,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	} finally {
		await context?.close();
	}
}
