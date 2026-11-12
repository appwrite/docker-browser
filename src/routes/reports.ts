import type { BrowserContext, BrowserContextOptions } from "playwright-core";
import { playAudit } from "playwright-lighthouse";
import {
	admission,
	defaultContext,
	getBrowser,
	lighthouseConfigs,
} from "../config";
import { lighthouseSchema } from "../schemas";
import { closeOnAbort } from "../utils/abort.js";
import {
	type EgressGuard,
	startEgressGuard,
	watchNavigations,
} from "../utils/egress.js";
import { failureResponse } from "../utils/failure.js";
import { type Capture, memoryGuard } from "../utils/memory.js";
import { assertAllowedUrl } from "../utils/ssrf.js";

export async function handleReportsRequest(
	request: Request,
): Promise<Response> {
	let context: BrowserContext | undefined;
	let guard: EgressGuard | undefined;
	let capture: Capture | undefined;

	try {
		const json = await request.json();
		const body = lighthouseSchema.parse(json);

		// Fails fast with a clear error; the egress guard below is what enforces
		// the policy on every connection the browser makes.
		await assertAllowedUrl(body.url);

		guard = await startEgressGuard();

		const contextOptions: BrowserContextOptions = {
			...defaultContext,
			colorScheme: body.theme,
			proxy: { server: guard.server, bypass: guard.bypass },
		};

		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;

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

		await page.route("**/*", async (route, intercepted) => {
			if (body.headers && new URL(intercepted.url()).origin === targetOrigin) {
				return await route.continue({
					headers: {
						...intercepted.headers(),
						...body.headers,
					},
				});
			}

			return await route.continue({ headers: intercepted.headers() });
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
