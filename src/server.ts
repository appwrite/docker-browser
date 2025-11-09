import { port } from "./config";
import {
	handleHealthRequest,
	handleReportsRequest,
	handleScreenshotsRequest,
	handleTestRequest,
} from "./routes";

const server = Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		const path = url.pathname;

		// Route matching
		if (path === "/v1/screenshots" && req.method === "POST") {
			return await handleScreenshotsRequest(req);
		}

		if (path === "/v1/reports" && req.method === "POST") {
			return await handleReportsRequest(req);
		}

		if (path === "/v1/health" && req.method === "GET") {
			return await handleHealthRequest(req);
		}

		if (path === "/v1/test" && req.method === "GET") {
			return await handleTestRequest(req);
		}

		// 404 Not Found
		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Server running on http://0.0.0.0:${server.port}`);
