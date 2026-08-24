import { defaultContext, getBrowser } from "../config";
import { generateTestHTML } from "../utils/test-page.js";

export async function handleTestRequest(_req: Request): Promise<Response> {
	const browser = await getBrowser();
	const context = await browser.newContext(defaultContext);
	try {
		const page = await context.newPage();

		await page.goto("about:blank");

		const html = await page.evaluate(() => {
			return new Date().toISOString();
		});

		await context.close();

		return new Response(generateTestHTML(html), {
			headers: { "Content-Type": "text/html" },
		});
	} finally {
		await context.close();
	}
}

// Browser.crash is the same CDP command Chromium itself exposes for testing
// crash recovery, so this exercises a real browser-level crash rather than
// simulating one by killing the OS process from outside.
export async function handleTestCrashRequest(_req: Request): Promise<Response> {
	const browser = await getBrowser();
	const session = await browser.newBrowserCDPSession();

	session.send("Browser.crash").catch(() => {});

	return new Response("ok");
}
