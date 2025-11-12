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

	// Threshold boundary tests
	test("should accept thresholds at minimum (0)", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				performance: 0,
				accessibility: 0,
				"best-practices": 0,
				seo: 0,
				pwa: 0,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept thresholds at maximum (100)", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				performance: 100,
				accessibility: 100,
				"best-practices": 100,
				seo: 100,
				pwa: 100,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject threshold below minimum", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				performance: -1,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should accept partial thresholds", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				performance: 90,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject threshold exceeding maximum for accessibility", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				accessibility: 101,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject threshold exceeding maximum for seo", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			thresholds: {
				seo: 150,
			},
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Report format combination tests
	test("should support json and html formats together", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			json: true,
			html: true,
			csv: false,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.json).toBe(true);
			expect(result.data.html).toBe(true);
			expect(result.data.csv).toBe(false);
		}
	});

	test("should support json and csv formats together", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			json: true,
			html: false,
			csv: true,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.json).toBe(true);
			expect(result.data.html).toBe(false);
			expect(result.data.csv).toBe(true);
		}
	});

	test("should support html and csv formats together", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			json: false,
			html: true,
			csv: true,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.json).toBe(false);
			expect(result.data.html).toBe(true);
			expect(result.data.csv).toBe(true);
		}
	});

	test("should support all formats disabled", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			json: false,
			html: false,
			csv: false,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.json).toBe(false);
			expect(result.data.html).toBe(false);
			expect(result.data.csv).toBe(false);
		}
	});

	// Timeout boundary tests
	test("should accept timeout at minimum (0)", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			timeout: 0,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept timeout at maximum (120000)", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			timeout: 120000,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject timeout exceeding maximum", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			timeout: 120001,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject negative timeout", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			timeout: -1,
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Timezone validation tests
	test("should accept valid IANA timezones", () => {
		const timezones = [
			"America/New_York",
			"Europe/London",
			"Asia/Tokyo",
			"UTC/GMT",
		];

		for (const timezoneId of timezones) {
			const input = {
				url: "https://example.com",
				viewport: "mobile",
				timezoneId,
			};

			const result = lighthouseSchema.safeParse(input);
			expect(result.success).toBe(true);
		}
	});

	test("should reject invalid timezone format", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			timezoneId: "InvalidTimezone",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject timezone without region", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			timezoneId: "America",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Theme validation tests
	test("should accept both theme options", () => {
		const lightInput = {
			url: "https://example.com",
			viewport: "mobile",
			theme: "light",
		};

		const lightResult = lighthouseSchema.safeParse(lightInput);
		expect(lightResult.success).toBe(true);

		const darkInput = {
			url: "https://example.com",
			viewport: "mobile",
			theme: "dark",
		};

		const darkResult = lighthouseSchema.safeParse(darkInput);
		expect(darkResult.success).toBe(true);
	});

	test("should reject invalid theme", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			theme: "blue",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// waitUntil validation tests
	test("should accept all valid waitUntil options", () => {
		const options = ["load", "domcontentloaded", "networkidle", "commit"];

		for (const waitUntil of options) {
			const input = {
				url: "https://example.com",
				viewport: "mobile",
				waitUntil,
			};

			const result = lighthouseSchema.safeParse(input);
			expect(result.success).toBe(true);
		}
	});

	test("should reject invalid waitUntil option", () => {
		const input = {
			url: "https://example.com",
			viewport: "mobile",
			waitUntil: "complete",
		};

		const result = lighthouseSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});
