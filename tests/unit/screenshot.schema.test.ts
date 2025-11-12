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

	// Viewport boundary tests
	test("should accept viewport at minimum (1x1)", () => {
		const input = {
			url: "https://example.com",
			viewport: { width: 1, height: 1 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept viewport at maximum (3840x2160)", () => {
		const input = {
			url: "https://example.com",
			viewport: { width: 3840, height: 2160 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject viewport exceeding maximum width", () => {
		const input = {
			url: "https://example.com",
			viewport: { width: 3841, height: 1080 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject viewport exceeding maximum height", () => {
		const input = {
			url: "https://example.com",
			viewport: { width: 1920, height: 2161 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject viewport with zero dimensions", () => {
		const input = {
			url: "https://example.com",
			viewport: { width: 0, height: 0 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Quality boundary tests
	test("should accept quality at minimum (0)", () => {
		const input = {
			url: "https://example.com",
			format: "jpeg",
			quality: 0,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept quality at maximum (100)", () => {
		const input = {
			url: "https://example.com",
			format: "jpeg",
			quality: 100,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject quality below minimum", () => {
		const input = {
			url: "https://example.com",
			format: "jpeg",
			quality: -1,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Sleep boundary tests
	test("should accept sleep at minimum (0)", () => {
		const input = {
			url: "https://example.com",
			sleep: 0,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept sleep at maximum (60000)", () => {
		const input = {
			url: "https://example.com",
			sleep: 60000,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject sleep exceeding maximum", () => {
		const input = {
			url: "https://example.com",
			sleep: 60001,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject negative sleep", () => {
		const input = {
			url: "https://example.com",
			sleep: -1,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Timeout boundary tests
	test("should accept timeout at minimum (0)", () => {
		const input = {
			url: "https://example.com",
			timeout: 0,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept timeout at maximum (120000)", () => {
		const input = {
			url: "https://example.com",
			timeout: 120000,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject timeout exceeding maximum", () => {
		const input = {
			url: "https://example.com",
			timeout: 120001,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Device scale factor boundary tests
	test("should accept device scale factor at minimum (0.1)", () => {
		const input = {
			url: "https://example.com",
			deviceScaleFactor: 0.1,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept device scale factor at maximum (3)", () => {
		const input = {
			url: "https://example.com",
			deviceScaleFactor: 3,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject device scale factor below minimum", () => {
		const input = {
			url: "https://example.com",
			deviceScaleFactor: 0.09,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject device scale factor above maximum", () => {
		const input = {
			url: "https://example.com",
			deviceScaleFactor: 3.1,
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Geolocation boundary tests
	test("should accept geolocation at latitude minimum (-90)", () => {
		const input = {
			url: "https://example.com",
			geolocation: { latitude: -90, longitude: 0 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept geolocation at latitude maximum (90)", () => {
		const input = {
			url: "https://example.com",
			geolocation: { latitude: 90, longitude: 0 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject geolocation exceeding latitude bounds", () => {
		const input = {
			url: "https://example.com",
			geolocation: { latitude: 91, longitude: 0 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should accept geolocation at longitude minimum (-180)", () => {
		const input = {
			url: "https://example.com",
			geolocation: { latitude: 0, longitude: -180 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should accept geolocation at longitude maximum (180)", () => {
		const input = {
			url: "https://example.com",
			geolocation: { latitude: 0, longitude: 180 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject geolocation exceeding longitude bounds", () => {
		const input = {
			url: "https://example.com",
			geolocation: { latitude: 0, longitude: 181 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	// Clip region boundary tests
	test("should accept clip at minimum dimensions", () => {
		const input = {
			url: "https://example.com",
			clip: { x: 0, y: 0, width: 1, height: 1 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("should reject clip with zero width", () => {
		const input = {
			url: "https://example.com",
			clip: { x: 0, y: 0, width: 0, height: 100 },
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject clip with zero height", () => {
		const input = {
			url: "https://example.com",
			clip: { x: 0, y: 0, width: 100, height: 0 },
		};

		const result = screenshotSchema.safeParse(input);
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
				timezoneId,
			};

			const result = screenshotSchema.safeParse(input);
			expect(result.success).toBe(true);
		}
	});

	test("should reject invalid timezone format", () => {
		const input = {
			url: "https://example.com",
			timezoneId: "InvalidTimezone",
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("should reject timezone without region", () => {
		const input = {
			url: "https://example.com",
			timezoneId: "America",
		};

		const result = screenshotSchema.safeParse(input);
		expect(result.success).toBe(false);
	});
});
