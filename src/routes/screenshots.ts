import type {
	BrowserContext,
	BrowserContextOptions,
	PageScreenshotOptions,
} from "playwright-core";
import { defaultContext, getBrowser } from "../config";
import { screenshotSchema } from "../schemas";
import { assertPublicUrl, isPublicHost } from "../utils/ssrf.js";

export async function handleScreenshotsRequest(
	req: Request,
): Promise<Response> {
	let context: BrowserContext | undefined;

	try {
		const json = await req.json();
		const body = screenshotSchema.parse(json);

		// The browser resolves and navigates on its own, so guard the target
		// here to keep a user-supplied URL from reaching internal addresses.
		await assertPublicUrl(body.url);

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

		const browser = await getBrowser();
		context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		const page = await context.newPage();
		const targetOrigin = new URL(body.url).origin;
		const hostAllowed = new Map<string, Promise<boolean>>();

		// Re-check every request the page makes — redirects, iframes and
		// subresources each resolve independently and could target an internal
		// address that the initial check never saw.
		await page.route("**/*", async (route, request) => {
			const requestUrl = new URL(request.url());

			if (requestUrl.protocol === "http:" || requestUrl.protocol === "https:") {
				let allowed = hostAllowed.get(requestUrl.hostname);
				if (allowed === undefined) {
					allowed = isPublicHost(requestUrl.hostname);
					hostAllowed.set(requestUrl.hostname, allowed);
				}
				if (!(await allowed)) {
					return await route.abort("blockedbyclient");
				}
			}

			// Override headers only for the target origin
			if (requestUrl.origin === targetOrigin) {
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
