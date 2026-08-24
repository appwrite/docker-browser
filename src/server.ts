import { port } from "./config";
import {
	handleHealthRequest,
	handleReportsRequest,
	handleScreenshotsRequest,
	handleTestCrashRequest,
	handleTestRequest,
} from "./routes";
import { Router } from "./utils/router";

const router = new Router();
router.add("POST", "/v1/screenshots", handleScreenshotsRequest);
router.add("POST", "/v1/reports", handleReportsRequest);
router.add("GET", "/v1/health", handleHealthRequest);
router.add("GET", "/v1/test", handleTestRequest);

// Destroys the shared browser instance, so it stays out of the deployed
// image's reachable surface unless a caller opts in for local and CI runs.
if (process.env.ENABLE_TEST_ROUTES === "1") {
	router.add("POST", "/v1/test/crash", handleTestCrashRequest);
}

const server = Bun.serve({
	port,
	fetch: (request) => router.handle(request),
});

console.log(`Server running on http://0.0.0.0:${server.port}`);
