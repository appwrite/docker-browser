import { describe, expect, test } from "bun:test";
import { lighthouseSchema } from "../../src/schemas";

describe("lighthouseSchema", () => {
	test("should validate minimal valid input", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should apply default values", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
		};

		const result = lighthouseSchema.parse(input);
		expect(result.theme).toBe("light");
		expect(result.html).toBe(false);
		expect(result.json).toBe(true);
		expect(result.csv).toBe(false);
		expect(result.waitUntil).toBe("domcontentloaded");
		expect(result.timeout).toBe(30000);
	});

	test("should validate both viewport options", () => {
		const mobileInput = {
			url: "https://example.com",
			viewport: "mobile",
		};

		const mobileResult = lighthouseSchema.safeParse(mobileInput);
		expect(mobileResult.success).toBe(true);

		const desktopInput = {
			url: "https://example.com",
			viewport: "desktop",
		};

		const desktopResult = lighthouseSchema.safeParse(desktopInput);
		expect(desktopResult.success).toBe(true);
	});

	test("should reject invalid viewport", () => {
		const input = {
			url: "https://example.com",
			viewport: "tablet",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should validate report format flags", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			html: true,
			json: true,
			csv: true,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.html).toBe(true);
			expect(result.data.json).toBe(true);
			expect(result.data.csv).toBe(true);
		}
	});

	test("should validate custom thresholds", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				performance: 90,
				accessibility: 80,
				"best-practices": 85,
				seo: 75,
				pwa: 50,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject threshold out of range", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				performance: 101,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should validate permissions array", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			permissions: ["geolocation", "notifications"],
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should validate headers", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			headers: {
				"X-Custom-Header": "value",
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject invalid URL", () => {
		const input = {
			url: "not-a-url",
			viewport: "mobile",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});
