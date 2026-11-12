import { admission, port } from "./config";
import {
	handleHealthRequest,
	handleReportsRequest,
	handleScreenshotsRequest,
	handleTestRequest,
} from "./routes";
import { admit } from "./utils/admission";
import { Router } from "./utils/router";

const router = new Router();
router.add(
	"POST",
	"/v1/screenshots",
	admit(admission, handleScreenshotsRequest),
);
router.add("POST", "/v1/reports", admit(admission, handleReportsRequest));
router.add("GET", "/v1/health", handleHealthRequest);
router.add("GET", "/v1/test", handleTestRequest);

const server = Bun.serve({
	port,
	fetch: (request) => router.handle(request),
});

console.log(`Server running on http://0.0.0.0:${server.port}`);
