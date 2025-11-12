import { browser, defaultContext } from "../config";
import { generateTestHTML } from "../utils/test-page.js";

export async function handleTestRequest(_req: Request): Promise<Response> {
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
