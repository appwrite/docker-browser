import type { BrowserContext, BrowserContextOptions } from "playwright-core";
import { playAudit } from "playwright-lighthouse";
import { defaultContext, getBrowser, lighthouseConfigs } from "../config";
import { lighthouseSchema } from "../schemas";
import { assertAllowedUrl, isAllowedHost } from "../utils/ssrf.js";

export async function handleReportsRequest(req: Request): Promise<Response> {
	let context: BrowserContext | undefined;

	try {
		const json = await req.json();
		const body = lighthouseSchema.parse(json);

		// The browser resolves and navigates on its own, so guard the target
		// here to keep a user-supplied URL from reaching internal addresses.
		await assertAllowedUrl(body.url);

		// Build context options
		const contextOptions: BrowserContextOptions = {
			...defaultContext,
			colorScheme: body.theme,
		};

		// Add optional context options
		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;

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
					allowed = isAllowedHost(requestUrl.hostname);
					hostAllowed.set(requestUrl.hostname, allowed);
				}
				if (!(await allowed)) {
					return await route.abort("blockedbyclient");
				}
			}

			// Override headers only for the target origin
			if (body.headers && requestUrl.origin === targetOrigin) {
				return await route.continue({
					headers: {
						...request.headers(),
						...body.headers,
					},
				});
			}

			return await route.continue({ headers: request.headers() });
		});

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
			config: lighthouseConfigs[body.viewport],
			page: page,
			port: 9222,
			thresholds,
		});

		const report = Array.isArray(results.report)
			? results.report.join("")
			: results.report;
		return new Response(report, {
			headers: { "Content-Type": "application/json" },
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
