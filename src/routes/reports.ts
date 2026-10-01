import type { BrowserContext, BrowserContextOptions } from "playwright-core";
import { playAudit } from "playwright-lighthouse";
import { defaultContext, getBrowser, lighthouseConfigs } from "../config";
import { lighthouseSchema } from "../schemas";
import {
	BlockedNavigationError,
	type EgressGuard,
	startEgressGuard,
	watchNavigations,
} from "../utils/egress.js";
import { assertPublicUrl } from "../utils/ssrf.js";

export async function handleReportsRequest(req: Request): Promise<Response> {
	let context: BrowserContext | undefined;
	let guard: EgressGuard | undefined;

	try {
		const json = await req.json();
		const body = lighthouseSchema.parse(json);

		// Fails fast with a clear error; the egress guard below is what enforces
		// the policy on every connection the browser makes.
		await assertPublicUrl(body.url);

		guard = await startEgressGuard();

		// Build context options
		const contextOptions: BrowserContextOptions = {
			...defaultContext,
			colorScheme: body.theme,
			proxy: { server: guard.server, bypass: guard.bypass },
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
		const navigations = watchNavigations(page, guard);
		const targetOrigin = new URL(body.url).origin;

		// Override headers only for the target origin
		await page.route("**/*", async (route, request) => {
			if (body.headers && new URL(request.url()).origin === targetOrigin) {
				return await route.continue({
					headers: {
						...request.headers(),
						...body.headers,
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

		navigations.assertAllowed();

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

		// Lighthouse reloads the page itself, so check what that navigation did.
		navigations.assertAllowed();

		const report = Array.isArray(results.report)
			? results.report.join("")
			: results.report;
		return new Response(report, {
			headers: { "Content-Type": "application/json" },
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
