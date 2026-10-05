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
	["::", 128], // Unspecified
	["fc00::", 7], // Unique local
	["fe80::", 10], // Link-local
	["ff00::", 8], // Multicast
	["2001:db8::", 32], // Documentation
	["2001::", 32], // Teredo
	["100::", 64], // Discard
	["64:ff9b::", 96], // IPv4/IPv6 translation
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

/**
 * Resolves a hostname and returns true only when every address it resolves to
 * is publicly routable. IP literals are checked directly.
 */
export async function isPublicHost(host: string): Promise<boolean> {
	const hostname = host.replace(/^\[|\]$/g, "");

	if (isIP(hostname) !== 0) {
		return isPublicIp(hostname);
	}

	let addresses: { address: string }[];
	try {
		addresses = await lookup(hostname, { all: true });
	} catch {
		return false;
	}

	if (addresses.length === 0) {
		return false;
	}

	return addresses.every((entry) => isPublicIp(entry.address));
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
