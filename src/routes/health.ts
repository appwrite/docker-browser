import { admission, instance } from "../config";
import { Status } from "../utils/status.js";

export async function handleHealthRequest(): Promise<Response> {
	// Non-2xx so an httpGet liveness probe restarts a pod whose Chromium died
	// or whose idle memory has crept over the budget.
	const healthy = instance.isConnected() && admission.healthy();

	return new Response(
		JSON.stringify({
			status: healthy ? "pass" : "fail",
		}),
		{
			status: healthy ? Status.Ok : Status.Unavailable,
			headers: { "Content-Type": "application/json" },
		},
	);
}
