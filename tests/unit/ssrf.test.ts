import { describe, expect, test } from "bun:test";
import {
	assertAllowedUrl,
	isAllowedHost,
	isPublicHost,
	isPublicIp,
	parseAllowedHosts,
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

describe("assertAllowedUrl", () => {
	test("rejects non-http schemes", async () => {
		await expect(assertAllowedUrl("file:///etc/passwd")).rejects.toThrow(
			"is not allowed",
		);
		await expect(assertAllowedUrl("gopher://1.1.1.1/")).rejects.toThrow(
			"is not allowed",
		);
	});

	test("rejects internal and metadata targets", async () => {
		await expect(
			assertAllowedUrl("http://169.254.169.254/latest/meta-data/"),
		).rejects.toThrow("not publicly routable");
		await expect(assertAllowedUrl("http://127.0.0.1/")).rejects.toThrow(
			"not publicly routable",
		);
		await expect(assertAllowedUrl("http://[::1]/")).rejects.toThrow(
			"not publicly routable",
		);
	});

	test("rejects malformed URLs", async () => {
		await expect(assertAllowedUrl("not a url")).rejects.toThrow("Invalid URL");
	});
});

describe("allowed hosts", () => {
	const allowed = parseAllowedHosts(" appwrite, Internal.Example ,,");

	test("parses a comma-separated list, trimmed and lower-cased", () => {
		expect([...allowed]).toEqual(["appwrite", "internal.example"]);
		expect(parseAllowedHosts(undefined).size).toBe(0);
	});

	test("lets listed hosts through, case-insensitively", async () => {
		expect(await isAllowedHost("appwrite", allowed)).toBe(true);
		expect(await isAllowedHost("INTERNAL.example", allowed)).toBe(true);
		await expect(
			assertAllowedUrl("http://appwrite/?preview=1", allowed),
		).resolves.toBeUndefined();
	});

	test("keeps every other private address blocked", async () => {
		expect(await isAllowedHost("169.254.169.254", allowed)).toBe(false);
		expect(await isAllowedHost("127.0.0.1", allowed)).toBe(false);
		await expect(
			assertAllowedUrl("http://169.254.169.254/latest/meta-data/", allowed),
		).rejects.toThrow("not publicly routable");
	});

	test("still allows public hosts", async () => {
		expect(await isAllowedHost("8.8.8.8", allowed)).toBe(true);
	});

	test("allows nothing private by default", async () => {
		expect(await isAllowedHost("appwrite", new Set())).toBe(false);
	});
});
