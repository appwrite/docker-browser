import { describe, expect, test } from "bun:test";
import {
	assertPublicUrl,
	isPublicHost,
	isPublicIp,
	resolveHost,
} from "../../src/utils/ssrf.js";

describe("isPublicIp", () => {
	test("accepts public addresses", () => {
		expect(isPublicIp("8.8.8.8")).toBe(true);
		expect(isPublicIp("1.1.1.1")).toBe(true);
		expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
	});

	test("rejects private, reserved and metadata addresses", () => {
		expect(isPublicIp("127.0.0.1")).toBe(false);
		expect(isPublicIp("10.0.0.5")).toBe(false);
		expect(isPublicIp("192.168.1.1")).toBe(false);
		expect(isPublicIp("172.16.0.1")).toBe(false);
		expect(isPublicIp("100.64.0.1")).toBe(false);
		expect(isPublicIp("169.254.169.254")).toBe(false); // AWS/GCP IMDS
		expect(isPublicIp("::1")).toBe(false);
		expect(isPublicIp("fe80::1")).toBe(false);
		expect(isPublicIp("fc00::1")).toBe(false);
		expect(isPublicIp("::ffff:169.254.169.254")).toBe(false); // IPv4-mapped
		expect(isPublicIp("::ffff:7f00:1")).toBe(false); // IPv4-mapped, hex form
		expect(isPublicIp("::7f00:1")).toBe(false); // IPv4-compatible
		expect(isPublicIp("64:ff9b:1::a00:1")).toBe(false); // Local-use NAT64
		expect(isPublicIp("192.88.99.1")).toBe(false); // 6to4 relay anycast
	});

	test("rejects non-IP input", () => {
		expect(isPublicIp("not-an-ip")).toBe(false);
		expect(isPublicIp("")).toBe(false);
	});
});

describe("isPublicHost", () => {
	test("checks IP literals directly", async () => {
		expect(await isPublicHost("8.8.8.8")).toBe(true);
		expect(await isPublicHost("169.254.169.254")).toBe(false);
		expect(await isPublicHost("[::1]")).toBe(false);
	});

	test("rejects hostnames that do not resolve", async () => {
		expect(await isPublicHost("a-host-that-does-not-exist.invalid")).toBe(
			false,
		);
	});
});

describe("resolveHost", () => {
	test("returns the checked address for a public IP literal", async () => {
		expect(await resolveHost("8.8.8.8")).toEqual({
			status: "public",
			addresses: [{ address: "8.8.8.8", family: 4 }],
		});
		expect(await resolveHost("[2606:4700:4700::1111]")).toEqual({
			status: "public",
			addresses: [{ address: "2606:4700:4700::1111", family: 6 }],
		});
	});

	test("refuses private hosts without returning an address", async () => {
		expect(await resolveHost("127.0.0.1")).toEqual({ status: "private" });
		expect(await resolveHost("localhost")).toEqual({ status: "private" });
		expect(await resolveHost("[::1]")).toEqual({ status: "private" });
	});

	test("tells unresolvable hosts apart from private ones", async () => {
		expect(await resolveHost("a-host-that-does-not-exist.invalid")).toEqual({
			status: "unresolved",
		});
	});
});

describe("assertPublicUrl", () => {
	test("rejects non-http schemes", async () => {
		await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(
			"is not allowed",
		);
		await expect(assertPublicUrl("gopher://1.1.1.1/")).rejects.toThrow(
			"is not allowed",
		);
	});

	test("rejects internal and metadata targets", async () => {
		await expect(
			assertPublicUrl("http://169.254.169.254/latest/meta-data/"),
		).rejects.toThrow("not publicly routable");
		await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow(
			"not publicly routable",
		);
		await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(
			"not publicly routable",
		);
	});

	test("rejects malformed URLs", async () => {
		await expect(assertPublicUrl("not a url")).rejects.toThrow("Invalid URL");
	});
});
