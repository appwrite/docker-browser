import { describe, expect, test } from "bun:test";
import { isSameOrigin } from "../../src/utils/headers";

describe("isSameOrigin", () => {
	test("matches same origin with different paths", () => {
		expect(
			isSameOrigin(
				"http://appwrite-api/assets/app.js",
				"http://appwrite-api/?appwrite-preview=1",
			),
		).toBe(true);
	});

	test("matches default docker compose host", () => {
		expect(
			isSameOrigin("http://appwrite/", "http://appwrite/?appwrite-theme=dark"),
		).toBe(true);
	});

	test("rejects different hosts", () => {
		expect(
			isSameOrigin("https://cdn.example.com/style.css", "http://appwrite-api/"),
		).toBe(false);
	});

	test("rejects different schemes on the same host", () => {
		expect(isSameOrigin("https://appwrite/", "http://appwrite/")).toBe(false);
	});

	test("rejects different ports", () => {
		expect(isSameOrigin("http://appwrite:8080/", "http://appwrite/")).toBe(
			false,
		);
	});

	test("returns false for invalid URLs", () => {
		expect(isSameOrigin("not-a-url", "http://appwrite/")).toBe(false);
		expect(isSameOrigin("http://appwrite/", "also-not-a-url")).toBe(false);
	});
});
