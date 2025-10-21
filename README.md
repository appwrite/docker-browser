# Docker Browser 🖥️

[![Discord](https://img.shields.io/discord/564160730845151244?label=discord&style=flat-square)](https://appwrite.io/discord)
[![Twitter Account](https://img.shields.io/twitter/follow/appwrite?color=00acee&label=twitter&style=flat-square)](https://twitter.com/appwrite)
[![appwrite.io](https://img.shields.io/badge/appwrite-.io-f02e65?style=flat-square)](https://appwrite.io)

Docker Browser is a powerful REST API for taking screenshots, generating Lighthouse reports, and performing web analysis with extensive configuration options.

## Features

- 📸 **Screenshots** with customizable viewport, format, and quality
- 📊 **Lighthouse Reports** for performance, accessibility, SEO, and more
- 🌐 **Browser Context** configuration (user agent, locale, timezone, geolocation)
- 🎨 **Theme Support** (light/dark mode)
- ⚡ **Performance** optimized with Playwright and Chromium
- 🔧 **Highly Configurable** with comprehensive API options

## Quick Start

Add Docker Browser to your `docker-compose.yml`:

```yaml
services:
  appwrite-browser:
    image: appwrite/browser:0.1.0
    ports:
      - "3000:3000"
```

Start the service:

```bash
docker compose up -d
```

Take a simple screenshot:

```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## API Endpoints

### Health Check

**GET** `/v1/health`

Check if the browser service is running.

```bash
curl http://localhost:3000/v1/health
```

**Response:**
```json
{
  "status": "ok"
}
```

### Screenshots

**POST** `/v1/screenshots`

Take screenshots of web pages with extensive configuration options.

#### Basic Usage

```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

#### Advanced Configuration

```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "format": "jpeg",
    "quality": 95,
    "fullPage": true,
    "theme": "dark",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "locale": "en-US",
    "timezoneId": "America/New_York",
    "geolocation": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 100
    },
    "headers": {
      "Authorization": "Bearer your-token",
      "X-Custom-Header": "value"
    },
    "waitUntil": "networkidle",
    "timeout": 60000,
    "sleep": 5000,
    "deviceScaleFactor": 2,
    "hasTouch": true,
    "isMobile": false
  }'
```

#### Screenshot Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | The URL to screenshot |
| `viewport` | object | `{width: 1280, height: 720}` | Viewport dimensions |
| `viewport.width` | number | 1280 | Viewport width (1-3840) |
| `viewport.height` | number | 720 | Viewport height (1-2160) |
| `format` | string | "png" | Image format: "png", "jpeg", "webp" |
| `quality` | number | 90 | Image quality 0-100 (for jpeg/webp) |
| `fullPage` | boolean | false | Capture full page scroll |
| `clip` | object | - | Crop area: `{x, y, width, height}` |
| `theme` | string | "light" | Browser theme: "light", "dark" |
| `userAgent` | string | - | Custom user agent string |
| `locale` | string | - | Browser locale (e.g., "en-US") |
| `timezoneId` | string | - | IANA timezone identifier (see [Timezone](#timezone) section) |
| `geolocation` | object | - | GPS coordinates |
| `geolocation.latitude` | number | - | Latitude (-90 to 90) |
| `geolocation.longitude` | number | - | Longitude (-180 to 180) |
| `geolocation.accuracy` | number | - | Accuracy in meters |
| `permissions` | array | - | Browser permissions (see [Permissions](#permissions) section) |
| `headers` | object | - | Custom HTTP headers |
| `waitUntil` | string | "domcontentloaded" | Wait condition: "load", "domcontentloaded", "networkidle", "commit" |
| `timeout` | number | 30000 | Navigation timeout (0-120000ms) |
| `sleep` | number | 3000 | Wait time after load (0-60000ms) |
| `deviceScaleFactor` | number | 1 | Device pixel ratio (0.1-3) |
| `hasTouch` | boolean | false | Touch support |
| `isMobile` | boolean | false | Mobile device emulation |

### Lighthouse Reports

**POST** `/v1/reports`

Generate Lighthouse performance, accessibility, SEO, and PWA reports.

#### Basic Usage

```bash
curl -X POST http://localhost:3000/v1/reports \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

#### Advanced Configuration

```bash
curl -X POST http://localhost:3000/v1/reports \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "viewport": "desktop",
    "json": true,
    "html": true,
    "csv": false,
    "theme": "dark",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "locale": "en-US",
    "timezoneId": "America/New_York",
    "headers": {
      "Authorization": "Bearer your-token"
    },
    "thresholds": {
      "performance": 90,
      "accessibility": 95,
      "best-practices": 85,
      "seo": 80,
      "pwa": 70
    },
    "waitUntil": "networkidle",
    "timeout": 60000
  }'
```

#### Report Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | **required** | The URL to analyze |
| `viewport` | string | "mobile" | Device type: "mobile", "desktop" |
| `json` | boolean | true | Include JSON report |
| `html` | boolean | false | Include HTML report |
| `csv` | boolean | false | Include CSV report |
| `theme` | string | "light" | Browser theme: "light", "dark" |
| `userAgent` | string | - | Custom user agent string |
| `locale` | string | - | Browser locale |
| `timezoneId` | string | - | IANA timezone identifier (see [Timezone](#timezone) section) |
| `permissions` | array | - | Browser permissions (see [Permissions](#permissions) section) |
| `headers` | object | - | Custom HTTP headers |
| `thresholds` | object | - | Performance thresholds (0-100) |
| `thresholds.performance` | number | 0 | Performance score threshold |
| `thresholds.accessibility` | number | 0 | Accessibility score threshold |
| `thresholds.best-practices` | number | 0 | Best practices score threshold |
| `thresholds.seo` | number | 0 | SEO score threshold |
| `thresholds.pwa` | number | 0 | PWA score threshold |
| `waitUntil` | string | "domcontentloaded" | Wait condition |
| `timeout` | number | 30000 | Navigation timeout (0-120000ms) |

## Timezone

The `timezoneId` parameter allows you to set the browser's timezone for accurate time-based testing and content capture. This is particularly useful for testing applications that display time-sensitive content or have timezone-dependent features.

### Format

The `timezoneId` must be a valid **IANA timezone identifier** in the format `Region/City`. This is the same format used by JavaScript's `Intl.DateTimeFormat` and is the standard for timezone identification.

### Valid Timezone Examples

#### Americas
- `America/New_York` - Eastern Time (US)
- `America/Chicago` - Central Time (US)
- `America/Denver` - Mountain Time (US)
- `America/Los_Angeles` - Pacific Time (US)
- `America/Toronto` - Eastern Time (Canada)
- `America/Vancouver` - Pacific Time (Canada)
- `America/Sao_Paulo` - Brasília Time (Brazil)
- `America/Mexico_City` - Central Time (Mexico)
- `America/Argentina/Buenos_Aires` - Argentina Time

#### Europe
- `Europe/London` - Greenwich Mean Time / British Summer Time
- `Europe/Paris` - Central European Time
- `Europe/Berlin` - Central European Time
- `Europe/Rome` - Central European Time
- `Europe/Madrid` - Central European Time
- `Europe/Amsterdam` - Central European Time
- `Europe/Moscow` - Moscow Time
- `Europe/Istanbul` - Turkey Time

#### Asia
- `Asia/Tokyo` - Japan Standard Time
- `Asia/Shanghai` - China Standard Time
- `Asia/Hong_Kong` - Hong Kong Time
- `Asia/Singapore` - Singapore Time
- `Asia/Seoul` - Korea Standard Time
- `Asia/Dubai` - Gulf Standard Time
- `Asia/Kolkata` - India Standard Time
- `Asia/Bangkok` - Indochina Time

#### Australia & Pacific
- `Australia/Sydney` - Australian Eastern Time
- `Australia/Melbourne` - Australian Eastern Time
- `Australia/Perth` - Australian Western Time
- `Pacific/Auckland` - New Zealand Time
- `Pacific/Honolulu` - Hawaii-Aleutian Time
- `Pacific/Fiji` - Fiji Time

#### Africa
- `Africa/Cairo` - Eastern European Time
- `Africa/Johannesburg` - South Africa Standard Time
- `Africa/Lagos` - West Africa Time
- `Africa/Nairobi` - East Africa Time

#### Special Cases
- `UTC` - Coordinated Universal Time
- `GMT` - Greenwich Mean Time

### Timezone Examples

#### Basic Timezone Setting
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "timezoneId": "America/New_York"
  }'
```

#### International Testing
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://ecommerce-site.com",
    "timezoneId": "Asia/Tokyo",
    "locale": "ja-JP"
  }'
```

#### UTC for Consistent Testing
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api-dashboard.com",
    "timezoneId": "UTC"
  }'
```

### Common Use Cases

- **E-commerce**: Test pricing displays in different timezones
- **Scheduling Apps**: Verify appointment times across regions
- **News Sites**: Check time-sensitive content display
- **Financial Apps**: Test market hours and trading times
- **Social Media**: Verify post timestamps and feeds
- **Analytics**: Test time-based reporting accuracy

### Validation

The API validates timezone identifiers using the IANA timezone database format. Invalid timezone identifiers will result in a validation error with a helpful message.

**Valid format**: `Region/City` (e.g., `America/New_York`)
**Invalid formats**: 
- `EST`, `PST` (abbreviations not supported)
- `UTC+5` (offset format not supported)
- `New York` (missing region prefix)

## Permissions

The `permissions` parameter allows you to grant specific browser permissions to the page during screenshot capture or report generation. This is useful for testing features that require user permission or for capturing content that depends on specific browser capabilities.

### Available Permissions

| Permission | Description | Use Case |
|------------|-------------|----------|
| `geolocation` | Access to device location | Location-based features, maps |
| `camera` | Access to device camera | Video calls, photo capture |
| `microphone` | Access to device microphone | Audio recording, voice calls |
| `notifications` | Display notifications | Push notifications, alerts |
| `clipboard-read` | Read from clipboard | Copy/paste functionality |
| `clipboard-write` | Write to clipboard | Copy/paste functionality |
| `payment-handler` | Handle payment requests | E-commerce, payment flows |
| `midi` | Access to MIDI devices | Music applications |
| `usb` | Access to USB devices | Hardware integration |
| `serial` | Access to serial ports | Hardware communication |
| `bluetooth` | Access to Bluetooth devices | IoT, wireless devices |
| `persistent-storage` | Persistent storage access | Offline data storage |
| `accelerometer` | Access to accelerometer | Motion detection, games |
| `gyroscope` | Access to gyroscope | Orientation, VR/AR |
| `magnetometer` | Access to magnetometer | Compass, navigation |
| `ambient-light-sensor` | Access to light sensor | Auto-brightness, themes |
| `background-sync` | Background synchronization | Offline sync |
| `background-fetch` | Background data fetching | Offline content |
| `idle-detection` | Detect user idle state | Power management |
| `periodic-background-sync` | Periodic background sync | Scheduled updates |
| `push` | Push messaging | Real-time notifications |
| `speaker-selection` | Audio output selection | Audio routing |
| `storage-access` | Cross-site storage access | Third-party cookies |
| `top-level-storage-access` | Top-level storage access | First-party storage |
| `window-management` | Window management | Multi-window apps |
| `local-fonts` | Access to local fonts | Custom typography |
| `display-capture` | Screen capture | Screen sharing |
| `nfc` | Near Field Communication | Contactless payments |
| `screen-wake-lock` | Prevent screen sleep | Always-on displays |
| `web-share` | Web Share API | Native sharing |
| `xr-spatial-tracking` | XR spatial tracking | VR/AR applications |

### Permission Examples

#### Basic Permissions
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "permissions": ["geolocation", "notifications"]
  }'
```

#### Camera and Microphone Access
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://video-call-app.com",
    "permissions": ["camera", "microphone", "notifications"]
  }'
```

#### Hardware Integration
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://iot-dashboard.com",
    "permissions": ["usb", "bluetooth", "serial"]
  }'
```

#### VR/AR Applications
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vr-app.com",
    "permissions": ["xr-spatial-tracking", "accelerometer", "gyroscope", "magnetometer"]
  }'
```

#### Payment and E-commerce
```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://ecommerce-site.com",
    "permissions": ["payment-handler", "clipboard-write", "nfc"]
  }'
```

## Examples

### Mobile Screenshot

```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "viewport": {"width": 375, "height": 667},
    "isMobile": true,
    "hasTouch": true,
    "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
  }'
```

### High-Quality Screenshot

```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "format": "jpeg",
    "quality": 100,
    "deviceScaleFactor": 2,
    "fullPage": true
  }'
```

### Geolocation Testing

```bash
curl -X POST http://localhost:3000/v1/screenshots \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "geolocation": {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "accuracy": 100
    },
    "timezoneId": "America/Los_Angeles"
  }'
```

### Performance Report with Custom Thresholds

```bash
curl -X POST http://localhost:3000/v1/reports \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "viewport": "desktop",
    "thresholds": {
      "performance": 90,
      "accessibility": 95,
      "best-practices": 85,
      "seo": 80
    },
    "html": true
  }'
```

## Development

Make sure you have [pnpm](https://pnpm.io/) installed.

Install dependencies:

```bash
pnpm i
```

Start the development server:

```bash
npm start
```

The API will be available at `http://localhost:3000`.

## Contributing

All code contributions, including those of people having commit access, must go through a pull request and be approved by a core developer before being merged. This is to ensure a proper review of all the code.

We truly ❤️ pull requests! If you wish to help, you can learn more about how you can contribute to this project in the [contribution guide](CONTRIBUTING.md).
