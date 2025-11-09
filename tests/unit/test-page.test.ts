import { describe, expect, test } from "bun:test";
import { generateTestHTML } from "../../src/utils/test-page.js";

describe("generateTestHTML", () => {
	test("should generate valid HTML", () => {
		const timestamp = "2024-01-01T00:00:00.000Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("<html lang=\"en\">");
		expect(html).toContain("</html>");
	});

	test("should include the timestamp", () => {
		const timestamp = "2024-01-01T12:34:56.789Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain(timestamp);
	});

	test("should include the title", () => {
		const timestamp = "2024-01-01T00:00:00.000Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain("Browser Configuration Test");
	});

	test("should include viewport section", () => {
		const timestamp = "2024-01-01T00:00:00.000Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain("Viewport Width");
		expect(html).toContain("Viewport Height");
		expect(html).toContain("Device Pixel Ratio");
	});

	test("should include localization section", () => {
		const timestamp = "2024-01-01T00:00:00.000Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain("Language");
		expect(html).toContain("Timezone");
	});

	test("should include updateValues function", () => {
		const timestamp = "2024-01-01T00:00:00.000Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain("function updateValues()");
	});

	test("should include refresh button", () => {
		const timestamp = "2024-01-01T00:00:00.000Z";
		const html = generateTestHTML(timestamp);

		expect(html).toContain("refresh-btn");
		expect(html).toContain("🔄 Refresh Values");
	});
});
