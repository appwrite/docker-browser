import { browser } from "../config";

export async function handleHealthRequest(_req: Request): Promise<Response> {
	return new Response(
		JSON.stringify({
			status: browser.isConnected() ? "ok" : "error",
		}),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
}
