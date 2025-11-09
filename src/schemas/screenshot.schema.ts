import { z } from "zod";

export const screenshotSchema = z.object({
	url: z.string().url(),
	theme: z.enum(["light", "dark"]).default("light"),
	headers: z.record(z.string(), z.any()).optional(),
	sleep: z.number().min(0).max(60000).default(3000),
	// Viewport options
	viewport: z
		.object({
			width: z.number().min(1).max(3840).default(1280),
			height: z.number().min(1).max(2160).default(720),
		})
		.optional(),
	// Screenshot options
	format: z.enum(["png", "jpeg", "webp"]).default("png"),
	quality: z.number().min(0).max(100).default(90),
	fullPage: z.boolean().default(false),
	clip: z
		.object({
			x: z.number().min(0),
			y: z.number().min(0),
			width: z.number().min(1),
			height: z.number().min(1),
		})
		.optional(),
	// Browser context options
	userAgent: z.string().optional(),
	locale: z.string().optional(),
	timezoneId: z
		.string()
		.regex(
			/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)\/[A-Za-z_]+$/,
			"Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')",
		)
		.optional(),
	geolocation: z
		.object({
			latitude: z.number().min(-90).max(90),
			longitude: z.number().min(-180).max(180),
			accuracy: z.number().min(0).optional(),
		})
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
	// Navigation options
	waitUntil: z
		.enum(["load", "domcontentloaded", "networkidle", "commit"])
		.default("domcontentloaded"),
	timeout: z.number().min(0).max(120000).default(30000),
	// Additional options
	deviceScaleFactor: z.number().min(0.1).max(3).default(1),
	hasTouch: z.boolean().default(false),
	isMobile: z.boolean().default(false),
});

export type ScreenshotRequest = z.infer<typeof screenshotSchema>;
