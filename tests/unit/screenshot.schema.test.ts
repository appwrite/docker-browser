import { describe, expect, test } from "bun:test";
import { screenshotSchema } from "../../src/schemas";

describe("screenshotSchema", () => {
	test("should validate minimal valid input", () => {
		const input = {
			url: "https://example.com",
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should apply default values", () => {
		const input = {
			url: "https://example.com",
		};

		const result = screenshotSchema.parse(input);
		expect(result.theme).toBe("light");
		expect(result.format).toBe("png");
		expect(result.fullPage).toBe(false);
		expect(result.quality).toBe(90);
		expect(result.waitUntil).toBe("domcontentloaded");
		expect(result.timeout).toBe(30000);
		expect(result.sleep).toBe(3000);
	});

	test("should validate custom viewport", () => {
		const input = {
			url: "https://example.com",
			viewport: {
				width: 1920,
				height: 1080,
			},
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.viewport?.width).toBe(1920);
			expect(result.data.viewport?.height).toBe(1080);
		}
	});

	test("should reject invalid URL", () => {
		const input = {
			url: "not-a-url",
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject invalid theme", () => {
		const input = {
			url: "https://example.com",
			theme: "invalid",
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject invalid format", () => {
		const input = {
			url: "https://example.com",
			format: "gif",
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should validate all supported formats", () => {
		const formats = ["png", "jpeg", "webp"];

		for (const format of formats) {
			const input = {
				url: "https://example.com",
				format,
			};

			const result = screenshotSchema.safeParse(input);
			expect(result.success).toBe(true);
		}
	});

	test("should validate quality range for jpeg", () => {
		const validInput = {
			url: "https://example.com",
			format: "jpeg",
			quality: 90,
		};

		const result = screenshotSchema.safeParse(validInput);
		expect(result.success).toBe(true);

		const invalidInput = {
			url: "https://example.com",
			format: "jpeg",
			quality: 101,
		};

		const invalidResult = screenshotSchema.safeParse(invalidInput);
		expect(invalidResult.success).toBe(false);
	});

	test("should validate permissions array", () => {
		const input = {
			url: "https://example.com",
			permissions: ["geolocation", "notifications"],
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should validate geolocation", () => {
		const input = {
			url: "https://example.com",
			geolocation: {
				latitude: 37.7749,
				longitude: -122.4194,
			},
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should validate clip region", () => {
		const input = {
			url: "https://example.com",
			clip: {
				x: 0,
				y: 0,
				width: 800,
				height: 600,
			},
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should validate headers", () => {
		const input = {
			url: "https://example.com",
			headers: {
				"X-Custom-Header": "value",
				Authorization: "Bearer token",
			},
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});
});
