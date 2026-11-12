import { BlockedNavigationError } from "./egress.js";
import { MEMORY_BUDGET_EXCEEDED } from "./memory.js";
import { Status } from "./status.js";

export const UNKNOWN_ERROR = "Unknown error";

function errorResponse(status: Status, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function failureResponse(error: unknown, exceeded: boolean): Response {
	if (exceeded) {
		return errorResponse(Status.InsufficientStorage, MEMORY_BUDGET_EXCEEDED);
	}

	if (error instanceof BlockedNavigationError) {
		return errorResponse(Status.Forbidden, error.message);
	}

	return errorResponse(
		Status.BadRequest,
		error instanceof Error ? error.message : UNKNOWN_ERROR,
	);
}
