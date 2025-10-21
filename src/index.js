import { createServer } from "node:http";
import {
	createApp,
	createRouter,
	defineEventHandler,
	toNodeListener,
} from "h3";
import { readValidatedBody } from "h3";
import lighthouseDesktopConfig from "lighthouse/core/config/lr-desktop-config.js";
import lighthouseMobileConfig from "lighthouse/core/config/lr-mobile-config.js";
import { chromium } from "playwright";
import { playAudit } from "playwright-lighthouse";
import { z } from "zod";

const port = process.env.PORT || 3000;

const app = createApp();
const router = createRouter();

console.log("Chromium starting...");
const browser = await chromium.launch({
	args: ["--remote-debugging-port=9222"],
});
console.log("Chromium started!");

app.use(router);

/** @type {Partial<import('playwright').BrowserContext>} defaultContext */
const defaultContext = {
	viewport: {
		width: 1280,
		height: 720,
	},
};

const screenshotSchema = z.object({
	url: z.string().url(),
	theme: z.enum(["light", "dark"]).default("light"),
	headers: z.record(z.string(), z.any()).optional(),
	sleep: z.number().min(0).max(60000).default(3000),
	// Viewport options
	viewport: z.object({
		width: z.number().min(1).max(3840).default(1280),
		height: z.number().min(1).max(2160).default(720),
	}).optional(),
	// Screenshot options
	format: z.enum(["png", "jpeg", "webp"]).default("png"),
	quality: z.number().min(0).max(100).default(90),
	fullPage: z.boolean().default(false),
	clip: z.object({
		x: z.number().min(0),
		y: z.number().min(0),
		width: z.number().min(1),
		height: z.number().min(1),
	}).optional(),
	// Browser context options
	userAgent: z.string().optional(),
	locale: z.string().optional(),
	timezoneId: z.string().regex(
		/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)\/[A-Za-z_]+$/,
		"Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')"
	).optional(),
	geolocation: z.object({
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
		accuracy: z.number().min(0).optional(),
	}).optional(),
	permissions: z.array(z.enum([
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
		"xr-spatial-tracking"
	])).optional(),
	// Navigation options
	waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded"),
	timeout: z.number().min(0).max(120000).default(30000),
	// Additional options
	deviceScaleFactor: z.number().min(0.1).max(3).default(1),
	hasTouch: z.boolean().default(false),
	isMobile: z.boolean().default(false),
});
router.post(
	"/v1/screenshots",
	defineEventHandler(async (event) => {
		const body = await readValidatedBody(event, screenshotSchema.parse);
		
		// Build context options
		const contextOptions = {
			...defaultContext,
			colorScheme: body.theme,
			viewport: body.viewport || defaultContext.viewport,
			deviceScaleFactor: body.deviceScaleFactor,
			hasTouch: body.hasTouch,
			isMobile: body.isMobile,
		};

		// Add optional context options
		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;
		if (body.geolocation) contextOptions.geolocation = body.geolocation;

		const context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		// await context.tracing.start({ screenshots: true, snapshots: true });

		const page = await context.newPage();

		// Override headers
		await page.route("**/*", async (route, request) => {
			const url = request.url();
			if (url.startsWith("http://appwrite/")) {
				return await route.continue({
					headers: {
						...request.headers(),
						...(body.headers || {}),
					},
				});
			}

			return await route.continue({ headers: request.headers() });
		});

		await page.goto(body.url, {
			waitUntil: body.waitUntil,
			timeout: body.timeout,
		});

		if (body.sleep > 0) {
			await page.waitForTimeout(body.sleep); // Safe addition for any extra JS
		}

		// Build screenshot options
		const screenshotOptions = {
			type: body.format,
			quality: body.quality,
			fullPage: body.fullPage,
		};

		if (body.clip) {
			screenshotOptions.clip = body.clip;
		}

		const screen = await page.screenshot(screenshotOptions);

		// await context.tracing.stop({ path: '/tmp/trace' + Date.now() + '.zip' });

		await context.close();
		return screen;
	}),
);

const lighthouseSchema = z.object({
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
	timezoneId: z.string().regex(
		/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)\/[A-Za-z_]+$/,
		"Must be a valid IANA timezone identifier (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')"
	).optional(),
	permissions: z.array(z.enum([
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
		"xr-spatial-tracking"
	])).optional(),
	// Performance thresholds
	thresholds: z.object({
		performance: z.number().min(0).max(100).default(0),
		accessibility: z.number().min(0).max(100).default(0),
		"best-practices": z.number().min(0).max(100).default(0),
		seo: z.number().min(0).max(100).default(0),
		pwa: z.number().min(0).max(100).default(0),
	}).optional(),
	// Navigation options
	waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded"),
	timeout: z.number().min(0).max(120000).default(30000),
});
const configs = {
	mobile: lighthouseMobileConfig,
	desktop: lighthouseDesktopConfig,
};
router.post(
	"/v1/reports",
	defineEventHandler(async (event) => {
		const body = await readValidatedBody(event, lighthouseSchema.parse);
		
		// Build context options
		const contextOptions = {
			...defaultContext,
			colorScheme: body.theme,
		};

		// Add optional context options
		if (body.userAgent) contextOptions.userAgent = body.userAgent;
		if (body.locale) contextOptions.locale = body.locale;
		if (body.timezoneId) contextOptions.timezoneId = body.timezoneId;

		const context = await browser.newContext(contextOptions);

		// Grant permissions if specified
		if (body.permissions && body.permissions.length > 0) {
			await context.grantPermissions(body.permissions, { origin: body.url });
		}

		const page = await context.newPage();

		// Override headers if provided
		if (body.headers) {
			await page.route("**/*", async (route, request) => {
				const url = request.url();
				if (url.startsWith("http://appwrite/")) {
					return await route.continue({
						headers: {
							...request.headers(),
							...body.headers,
						},
					});
				}
				return await route.continue({ headers: request.headers() });
			});
		}

		await page.goto(body.url, {
			waitUntil: body.waitUntil,
			timeout: body.timeout,
		});

		// Use custom thresholds if provided, otherwise use defaults
		const thresholds = body.thresholds || {
			"best-practices": 0,
			accessibility: 0,
			performance: 0,
			pwa: 0,
			seo: 0,
		};

		const results = await playAudit({
			reports: {
				formats: {
					html: body.html,
					json: body.json,
					csv: body.csv,
				},
			},
			config: configs[body.viewport],
			page: page,
			port: 9222,
			thresholds,
		});
		await context.close();
		return JSON.parse(results.report);
	}),
);

router.get(
	"/v1/health",
	defineEventHandler(async () => {
		return {
			status: browser.isConnected() ? "ok" : "error",
		};
	}),
);

router.get(
	"/v1/test",
	defineEventHandler(async (event) => {
		// Create a simple context with default settings
		const context = await browser.newContext(defaultContext);
		const page = await context.newPage();

		// Navigate to a simple page to get browser info
		await page.goto("about:blank");

		// Generate HTML page with browser configuration info
		const html = await page.evaluate(() => {
			const timestamp = new Date().toISOString();

			return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browser Configuration Test</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            line-height: 1.6;
            transition: all 0.3s ease;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #2E7D32;
            border-bottom: 2px solid #2E7D32;
            padding-bottom: 10px;
        }
        h2 {
            color: #1976D2;
            margin-top: 30px;
            border-left: 4px solid #1976D2;
            padding-left: 15px;
        }
        .config-section {
            background: #f5f5f5;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            border: 1px solid #ddd;
        }
        .config-item {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 8px;
            background: #ffffff;
            border-radius: 4px;
        }
        .config-label {
            font-weight: bold;
            color: #F57C00;
        }
        .config-value {
            color: #333333;
            font-family: 'Courier New', monospace;
        }
        .status-ok {
            color: #4CAF50;
            font-weight: bold;
        }
        .status-warning {
            color: #FF9800;
            font-weight: bold;
        }
        .status-error {
            color: #F44336;
            font-weight: bold;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .timestamp {
            text-align: center;
            color: #666;
            font-style: italic;
            margin-bottom: 30px;
        }
        .refresh-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #2196F3;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover {
            background: #1976D2;
        }
    </style>
</head>
<body>
    <button class="refresh-btn" onclick="updateValues()">🔄 Refresh Values</button>
    <div class="container">
        <h1>🌐 Browser Configuration Test</h1>
        <div class="timestamp">Generated: ${timestamp}</div>
        
        <div class="grid">
            <div class="config-section">
                <h2>📱 Viewport & Display</h2>
                <div class="config-item">
                    <span class="config-label">Viewport Width:</span>
                    <span class="config-value" id="viewport-width">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Viewport Height:</span>
                    <span class="config-value" id="viewport-height">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Screen Width:</span>
                    <span class="config-value" id="screen-width">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Screen Height:</span>
                    <span class="config-value" id="screen-height">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Device Pixel Ratio:</span>
                    <span class="config-value" id="device-pixel-ratio">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>🎨 Theme & Appearance</h2>
                <div class="config-item">
                    <span class="config-label">Color Scheme:</span>
                    <span class="config-value" id="color-scheme">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>🌍 Localization</h2>
                <div class="config-item">
                    <span class="config-label">Language:</span>
                    <span class="config-value" id="language">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Timezone:</span>
                    <span class="config-value" id="timezone">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>🔧 Device & Hardware</h2>
                <div class="config-item">
                    <span class="config-label">Touch Support:</span>
                    <span class="config-value" id="touch-support">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Mobile Device:</span>
                    <span class="config-value" id="mobile-device">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>🌐 User Agent</h2>
                <div class="config-item">
                    <span class="config-label">User Agent:</span>
                    <span class="config-value" id="user-agent" style="font-size: 12px; word-break: break-all;">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>📍 Geolocation</h2>
                <div class="config-item">
                    <span class="config-label">Location:</span>
                    <span class="config-value" id="geolocation-info">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>🔐 Permissions</h2>
                <div class="config-item">
                    <span class="config-label">Permission States:</span>
                    <span class="config-value" id="permissions-info">Loading...</span>
                </div>
            </div>

            <div class="config-section">
                <h2>📄 Page Information</h2>
                <div class="config-item">
                    <span class="config-label">URL:</span>
                    <span class="config-value" id="url">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Title:</span>
                    <span class="config-value" id="title">Loading...</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Ready State:</span>
                    <span class="config-value" id="ready-state">Loading...</span>
                </div>
            </div>
        </div>
    </div>

    <script>
        function updateValues() {
            // Viewport & Display
            document.getElementById('viewport-width').textContent = window.innerWidth + 'px';
            document.getElementById('viewport-height').textContent = window.innerHeight + 'px';
            document.getElementById('screen-width').textContent = screen.width + 'px';
            document.getElementById('screen-height').textContent = screen.height + 'px';
            document.getElementById('device-pixel-ratio').textContent = window.devicePixelRatio;

            // Theme & Appearance
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const colorSchemeEl = document.getElementById('color-scheme');
            colorSchemeEl.textContent = isDark ? 'Dark' : 'Light';
            colorSchemeEl.className = 'config-value status-' + (isDark ? 'ok' : 'warning');

            // Localization
            document.getElementById('language').textContent = navigator.language;
            document.getElementById('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Device & Hardware
            const hasTouch = 'ontouchstart' in window;
            const touchSupportEl = document.getElementById('touch-support');
            touchSupportEl.textContent = hasTouch ? 'Yes' : 'No';
            touchSupportEl.className = 'config-value status-' + (hasTouch ? 'ok' : 'warning');

            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const mobileDeviceEl = document.getElementById('mobile-device');
            mobileDeviceEl.textContent = isMobile ? 'Yes' : 'No';
            mobileDeviceEl.className = 'config-value status-' + (isMobile ? 'ok' : 'warning');

            // User Agent
            document.getElementById('user-agent').textContent = navigator.userAgent;

            // Geolocation
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        document.getElementById('geolocation-info').innerHTML = 
                            'Latitude: ' + position.coords.latitude + '<br>' +
                            'Longitude: ' + position.coords.longitude + '<br>' +
                            'Accuracy: ' + position.coords.accuracy + 'm';
                    },
                    (error) => {
                        document.getElementById('geolocation-info').innerHTML = 'Error: ' + error.message;
                    },
                    { timeout: 1000 }
                );
            } else {
                document.getElementById('geolocation-info').textContent = 'Not available';
            }

            // Permissions
            const checkPermissions = async () => {
                const permissions = [
                    'geolocation', 'camera', 'microphone', 'notifications',
                    'clipboard-read', 'clipboard-write', 'payment-handler',
                    'midi', 'usb', 'serial', 'bluetooth', 'persistent-storage'
                ];
                
                const results = {};
                for (const permission of permissions) {
                    try {
                        const result = await navigator.permissions.query({ name: permission });
                        results[permission] = result.state;
                    } catch (error) {
                        results[permission] = 'not-supported';
                    }
                }
                return results;
            };

            checkPermissions().then(permissions => {
                const permissionsDiv = document.getElementById('permissions-info');
                permissionsDiv.innerHTML = Object.entries(permissions)
                    .map(([perm, state]) => '<div><strong>' + perm + ':</strong> ' + state + '</div>')
                    .join('');
            });

            // Page Information
            document.getElementById('url').textContent = window.location.href;
            document.getElementById('title').textContent = document.title;
            const readyStateEl = document.getElementById('ready-state');
            readyStateEl.textContent = document.readyState;
            readyStateEl.className = 'config-value status-' + (document.readyState === 'complete' ? 'ok' : 'warning');

            // Update theme
            updateTheme();
        }

        function updateTheme() {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.style.background = isDark ? '#1a1a1a' : '#ffffff';
            document.body.style.color = isDark ? '#ffffff' : '#000000';
            
            const sections = document.querySelectorAll('.config-section');
            sections.forEach(section => {
                section.style.background = isDark ? '#2d2d2d' : '#f5f5f5';
                section.style.borderColor = isDark ? '#444' : '#ddd';
            });

            const items = document.querySelectorAll('.config-item');
            items.forEach(item => {
                item.style.background = isDark ? '#3d3d3d' : '#ffffff';
            });

            const labels = document.querySelectorAll('.config-label');
            labels.forEach(label => {
                label.style.color = isDark ? '#FFC107' : '#F57C00';
            });

            const values = document.querySelectorAll('.config-value');
            values.forEach(value => {
                value.style.color = isDark ? '#E0E0E0' : '#333333';
            });

            const h1 = document.querySelector('h1');
            h1.style.color = isDark ? '#4CAF50' : '#2E7D32';
            h1.style.borderBottomColor = isDark ? '#4CAF50' : '#2E7D32';

            const h2s = document.querySelectorAll('h2');
            h2s.forEach(h2 => {
                h2.style.color = isDark ? '#2196F3' : '#1976D2';
                h2.style.borderLeftColor = isDark ? '#2196F3' : '#1976D2';
            });

            const timestamp = document.querySelector('.timestamp');
            timestamp.style.color = isDark ? '#888' : '#666';
        }

        // Listen for theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);

        // Listen for resize events
        window.addEventListener('resize', updateValues);

        // Initial load
        updateValues();
    </script>
</body>
</html>`;
		});

		await context.close();
		
		// Set content type to HTML
		event.node.res.setHeader('Content-Type', 'text/html');
		return html;
	}),
);

createServer(toNodeListener(app)).listen(port);

console.log(`Server running on port http://0.0.0.0:${port}`);
