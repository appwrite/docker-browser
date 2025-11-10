import { z } from "zod";

export const lighthouseSchema = z.object({
	url: z.string().url(),
	viewport: z.enum(["mobile", "desktop"]).default("mobile"),
	json: z.boolean().default(true),
	html: z.boolean().default(false),
	csv: z.boolean().default(false),
	// Additional lighthouse options
	theme: z.enum(["light", "dark"]).default("light"),
	headers: z.record(z.string(), z.any()).optional(),
	userAgent: z.string().optional(),
	locale: z.string().optional(),
	timezoneId: z
		.string()
		.regex(
			/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)\/[A-Za-z_]+$/,
			"Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')",
		)
		.optional(),
	permissions: z
		.array(
			z.enum([
				"geolocation",
				"camera",
				"microphone",
				"notifications",
				"clipboard-read",
				"clipboard-write",
				"payment-handler",
				"midi",
				"usb",
				"serial",
				"bluetooth",
				"persistent-storage",
				"accelerometer",
				"gyroscope",
				"magnetometer",
				"ambient-light-sensor",
				"background-sync",
				"background-fetch",
				"idle-detection",
				"periodic-background-sync",
				"push",
				"speaker-selection",
				"storage-access",
				"top-level-storage-access",
				"window-management",
				"local-fonts",
				"display-capture",
				"nfc",
				"screen-wake-lock",
				"web-share",
				"xr-spatial-tracking",
			]),
		)
		.optional(),
	// Performance thresholds
	thresholds: z
		.object({
			performance: z.number().min(0).max(100).default(0),
			accessibility: z.number().min(0).max(100).default(0),
			"best-practices": z.number().min(0).max(100).default(0),
			seo: z.number().min(0).max(100).default(0),
			pwa: z.number().min(0).max(100).default(0),
		})
		.optional(),
	// Navigation options
	waitUntil: z
		.enum(["load", "domcontentloaded", "networkidle", "commit"])
		.default("domcontentloaded"),
	timeout: z.number().min(0).max(120000).default(30000),
});

export type LighthouseRequest = z.infer<typeof lighthouseSchema>;
