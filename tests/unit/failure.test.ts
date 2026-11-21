import { describe, expect, test } from "bun:test";
import { BlockedNavigationError } from "../../src/utils/egress.js";
import { UNKNOWN_ERROR, failureResponse } from "../../src/utils/failure.js";
import {
	CAPTURE_EVICTED,
	Closure,
	MEMORY_BUDGET_EXCEEDED,
} from "../../src/utils/memory.js";
import { BlockedUrlError } from "../../src/utils/ssrf.js";
import { Status } from "../../src/utils/status.js";

const RETRY_AFTER = 7;
const CLOSED = new Error("Target page, context or browser has been closed");

async function expectFailure(
	response: Response,
	status: Status,
	error: string,
	retryAfter: string | null = null,
): Promise<void> {
	expect(response.status).toBe(status);
	expect(response.headers.get("Content-Type")).toBe("application/json");
	expect(response.headers.get("Retry-After")).toBe(retryAfter);
	expect(await response.json()).toEqual({ error });
}

describe("failureResponse", () => {
	test("answers an evicted capture with 503 and Retry-After", async () => {
		await expectFailure(
			failureResponse(CLOSED, Closure.Evicted, RETRY_AFTER),
			Status.Unavailable,
			CAPTURE_EVICTED,
			String(RETRY_AFTER),
		);
	});

	test("answers a capture that exceeded the budget alone with 507", async () => {
		await expectFailure(
			failureResponse(CLOSED, Closure.Exceeded, RETRY_AFTER),
			Status.InsufficientStorage,
			MEMORY_BUDGET_EXCEEDED,
		);
	});

	test("lets the closure win over the error that closing caused", () => {
		const blocked = new BlockedNavigationError(
			"Navigation to http://10.0.0.1/",
		);

		expect(failureResponse(blocked, Closure.Evicted, RETRY_AFTER).status).toBe(
			Status.Unavailable,
		);
		expect(failureResponse(blocked, Closure.Exceeded, RETRY_AFTER).status).toBe(
			Status.InsufficientStorage,
		);
	});

	test("answers a blocked navigation with 403", async () => {
		const message = "Navigation to http://10.0.0.1/ was blocked.";

		await expectFailure(
			failureResponse(new BlockedNavigationError(message), null, RETRY_AFTER),
			Status.Forbidden,
			message,
		);
	});

	test("answers a blocked URL with 403", async () => {
		const message = "Host '10.0.0.1' is not publicly routable.";

		await expectFailure(
			failureResponse(new BlockedUrlError(message), null, RETRY_AFTER),
			Status.Forbidden,
			message,
		);
	});

	test("answers any other error with 400 and its message", async () => {
		await expectFailure(
			failureResponse(
				new Error("Timeout 30000ms exceeded."),
				null,
				RETRY_AFTER,
			),
			Status.BadRequest,
			"Timeout 30000ms exceeded.",
		);
	});

	test("answers a thrown non-error with 400 and a generic message", async () => {
		await expectFailure(
			failureResponse("not an error", null, RETRY_AFTER),
			Status.BadRequest,
			UNKNOWN_ERROR,
		);
	});
});
