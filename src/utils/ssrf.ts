import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * The browser resolves and navigates on its own, so the calling API cannot
 * pin the destination. These are the private, reserved, loopback, link-local
 * (including the 169.254.169.254 cloud-metadata address) and IPv4-embedding
 * ranges that a screenshot or report request must never reach.
 */
const blocklist = new BlockList();

for (const [address, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
	["255.255.255.255", 32],
] as const) {
	blocklist.addSubnet(address, prefix, "ipv4");
}

for (const [address, prefix] of [
	["::1", 128], // Loopback
	["::", 96], // Unspecified and IPv4-compatible
	["fc00::", 7], // Unique local
	["fe80::", 10], // Link-local
	["ff00::", 8], // Multicast
	["2001:db8::", 32], // Documentation
	["2001::", 32], // Teredo
	["100::", 64], // Discard
	["64:ff9b::", 96], // IPv4/IPv6 translation
	["64:ff9b:1::", 48], // Local-use IPv4/IPv6 translation
	["2002::", 16], // 6to4
] as const) {
	blocklist.addSubnet(address, prefix, "ipv6");
}

/**
 * Returns true only when the IP literal is a globally routable address.
 */
export function isPublicIp(ip: string): boolean {
	const family = isIP(ip);
	if (family === 0) {
		return false;
	}
	if (family === 6) {
		// An IPv4-mapped address (::ffff:a.b.c.d) is only as safe as the IPv4 it
		// carries, so check that directly rather than the reserved v6 ranges.
		const lower = ip.toLowerCase();
		if (lower.startsWith("::ffff:") && lower.includes(".")) {
			return isPublicIp(ip.slice(ip.lastIndexOf(":") + 1));
		}
		return !blocklist.check(ip, "ipv6");
	}
	return !blocklist.check(ip, "ipv4");
}

export type HostResolution =
	| { status: "public"; addresses: LookupAddress[] }
	| { status: "private" }
	| { status: "unresolved" };

/**
 * Resolves a hostname and returns its addresses only when every one of them
 * is publicly routable. IP literals are checked directly. Callers that connect
 * must dial one of the returned addresses rather than resolving again, or a
 * rebound DNS answer could swap in an internal address after the check.
 */
export async function resolveHost(host: string): Promise<HostResolution> {
	return resolveWith(host, isPublicIp);
}

async function resolveWith(
	host: string,
	permits: (ip: string) => boolean,
): Promise<HostResolution> {
	const hostname = host.replace(/^\[|\]$/g, "");

	const family = isIP(hostname);
	if (family !== 0) {
		return permits(hostname)
			? { status: "public", addresses: [{ address: hostname, family }] }
			: { status: "private" };
	}

	let addresses: LookupAddress[];
	try {
		addresses = await lookup(hostname, { all: true });
	} catch {
		return { status: "unresolved" };
	}

	if (addresses.length === 0) {
		return { status: "unresolved" };
	}

	if (!addresses.every((entry) => permits(entry.address))) {
		return { status: "private" };
	}

	return { status: "public", addresses };
}

/**
 * Resolves a hostname and returns true only when every address it resolves to
 * is publicly routable. IP literals are checked directly.
 */
export async function isPublicHost(host: string): Promise<boolean> {
	return (await resolveHost(host)).status === "public";
}

/**
 * Parses a comma-separated list of hostnames, as given in ALLOWED_HOSTS.
 */
export function parseAllowedHosts(value: string | undefined): Set<string> {
	return new Set(
		(value ?? "")
			.split(",")
			.map((host) => host.trim().toLowerCase())
			.filter((host) => host !== ""),
	);
}

const allowedHosts = parseAllowedHosts(process.env.ALLOWED_HOSTS);

/**
 * Returns true when the host is listed in ALLOWED_HOSTS (exact, case-insensitive)
 * or is publicly routable. Listing a host lets a self-hosted setup reach its own
 * internal services (e.g. `appwrite`) while every other private address stays blocked.
 */
export async function isAllowedHost(
	host: string,
	allowed: Set<string> = allowedHosts,
): Promise<boolean> {
	if (allowed.has(host.replace(/^\[|\]$/g, "").toLowerCase())) {
		return true;
	}

	return isPublicHost(host);
}

/**
 * Resolves like resolveHost, except that a host listed in ALLOWED_HOSTS is
 * returned with whatever addresses it resolves to, private ones included.
 */
export async function resolveAllowedHost(
	host: string,
	allowed: Set<string> = allowedHosts,
): Promise<HostResolution> {
	if (allowed.has(host.replace(/^\[|\]$/g, "").toLowerCase())) {
		return resolveWith(host, () => true);
	}

	return resolveHost(host);
}

/**
 * Rejects a URL that is not http(s) or whose host is neither allowed nor publicly routable.
 *
 * @throws Error when the URL must not be fetched.
 */
export async function assertAllowedUrl(
	rawUrl: string,
	allowed: Set<string> = allowedHosts,
): Promise<void> {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error("Invalid URL.");
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Scheme '${url.protocol}' is not allowed.`);
	}

	if (!(await isAllowedHost(url.hostname, allowed))) {
		throw new Error(`Host '${url.hostname}' is not publicly routable.`);
	}
}
