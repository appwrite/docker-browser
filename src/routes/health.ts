import { isBrowserConnected } from "../config";

export async function handleHealthRequest(_req: Request): Promise<Response> {
	const connected = isBrowserConnected();

	// Non-2xx so an httpGet liveness probe restarts a pod whose Chromium died.
	return new Response(
		JSON.stringify({
			status: connected ? "pass" : "fail",
		}),
		{
			status: connected ? 200 : 503,
			headers: { "Content-Type": "application/json" },
		},
	);
}
