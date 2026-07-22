/**
 * Returns true when `requestUrl` targets the same origin as `targetUrl`.
 * Used so custom headers are only applied to the screenshot/report target,
 * not to third-party subresources the page may load.
 */
export function isSameOrigin(requestUrl: string, targetUrl: string): boolean {
	try {
		const targetOrigin = new URL(targetUrl).origin;
		const requestOrigin = new URL(requestUrl).origin;
		return requestOrigin === targetOrigin;
	} catch {
		return false;
	}
}
