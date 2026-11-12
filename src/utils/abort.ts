import type { Closable } from "./memory.js";

export function closeOnAbort(signal: AbortSignal, target: Closable): void {
	signal.throwIfAborted();
	signal.addEventListener(
		"abort",
		() => {
			console.log("Capture abandoned by the client, closing its context");
			target.close().catch((error: unknown) => {
				console.error("Could not close an abandoned capture:", error);
			});
		},
		{ once: true },
	);
}
