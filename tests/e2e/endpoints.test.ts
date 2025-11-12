import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

describe("E2E Tests - /v1/health", () => {
	test("should return ok status when browser is connected", async () => {
		const response = await fetch(`${BASE_URL}/v1/health`);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(data).toHaveProperty("status");
		expect(data.status).toBe("pass");
	});

	test("should reject POST method", async () => {
		const response = await fetch(`${BASE_URL}/v1/health`, {
			method: "POST",
		});

		expect(response.status).toBe(404);
	});
});

describe("E2E Tests - /v1/test", () => {
	test("should return HTML test page", async () => {
		const response = await fetch(`${BASE_URL}/v1/test`);
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("Browser Configuration Test");
	});

	test("should include timestamp in response", async () => {
		const response = await fetch(`${BASE_URL}/v1/test`);
		const html = await response.text();

		expect(html).toContain("Generated:");
		// Check for ISO 8601 date format
		expect(html).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	test("should reject POST method", async () => {
		const response = await fetch(`${BASE_URL}/v1/test`, {
			method: "POST",
		});

		expect(response.status).toBe(404);
	});
});

describe("E2E Tests - /v1/screenshots", () => {
	test("should capture screenshot with minimal input", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/png");

		const buffer = await response.arrayBuffer();
		expect(buffer.byteLength).toBeGreaterThan(0);
	}, 15000);

	test("should capture screenshot with custom viewport", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
				viewport: {
					width: 800,
					height: 600,
				},
			}),
		});

		expect(response.status).toBe(200);
		const buffer = await response.arrayBuffer();
		expect(buffer.byteLength).toBeGreaterThan(0);
	}, 15000);

	test("should support jpeg format", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
				format: "jpeg",
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
	}, 15000);

	test("should capture full page screenshot", async () => {
		const partialResponse = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://appwrite.io",
				fullPage: false,
			}),
		});

		const partialBuffer = await partialResponse.arrayBuffer();

		const fullPageResponse = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://appwrite.io",
				fullPage: true,
			}),
		});

		expect(fullPageResponse.status).toBe(200);
		const fullPageBuffer = await fullPageResponse.arrayBuffer();

		// Full page screenshot should be larger than partial
		expect(fullPageBuffer.byteLength).toBeGreaterThan(partialBuffer.byteLength);
	}, 15000);

	test("should capture clipped region", async () => {
		const fullResponse = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
			}),
		});

		const fullBuffer = await fullResponse.arrayBuffer();

		const clippedResponse = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
				clip: {
					x: 0,
					y: 0,
					width: 400,
					height: 300,
				},
			}),
		});

		expect(clippedResponse.status).toBe(200);
		const clippedBuffer = await clippedResponse.arrayBuffer();

		expect(clippedBuffer.byteLength).toBeLessThan(fullBuffer.byteLength);
	}, 15000);

	test("should return 400 for malformed JSON", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{ invalid json",
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("should return 400 for missing URL parameter", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				format: "png",
			}),
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("should return 400 for invalid image format", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				format: "webp",
				url: "https://example.com",
			}),
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("should reject invalid URL", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "not-a-url",
			}),
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("should reject GET method", async () => {
		const response = await fetch(`${BASE_URL}/v1/screenshots`);
		expect(response.status).toBe(404);
	});
});

describe("E2E Tests - /v1/reports", () => {
	test("should generate lighthouse report", async () => {
		const response = await fetch(`${BASE_URL}/v1/reports`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
				viewport: "mobile",
			}),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");

		const data = await response.json();
		expect(data).toBeTruthy();
	}, 30000);

	test("should support desktop viewport", async () => {
		const response = await fetch(`${BASE_URL}/v1/reports`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
				viewport: "desktop",
			}),
		});

		expect(response.status).toBe(200);
	}, 30000);

	test("should reject invalid viewport", async () => {
		const response = await fetch(`${BASE_URL}/v1/reports`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com",
				viewport: "tablet",
			}),
		});

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data).toHaveProperty("error");
	});

	test("should reject GET method", async () => {
		const response = await fetch(`${BASE_URL}/v1/reports`);
		expect(response.status).toBe(404);
	});
});

describe("E2E Tests - 404 handling", () => {
	test("should return 404 for unknown routes", async () => {
		const response = await fetch(`${BASE_URL}/unknown`);
		expect(response.status).toBe(404);
	});

	test("should return 404 for /v1/unknown", async () => {
		const response = await fetch(`${BASE_URL}/v1/unknown`);
		expect(response.status).toBe(404);
	});
});
