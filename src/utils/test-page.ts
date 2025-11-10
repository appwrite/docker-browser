export function generateTestHTML(timestamp: string): string {
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
            document.getElementById('viewport-width').textContent = window.innerWidth + 'px';
            document.getElementById('viewport-height').textContent = window.innerHeight + 'px';
            document.getElementById('screen-width').textContent = screen.width + 'px';
            document.getElementById('screen-height').textContent = screen.height + 'px';
            document.getElementById('device-pixel-ratio').textContent = window.devicePixelRatio;

            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const colorSchemeEl = document.getElementById('color-scheme');
            colorSchemeEl.textContent = isDark ? 'Dark' : 'Light';
            colorSchemeEl.className = 'config-value status-' + (isDark ? 'ok' : 'warning');

            document.getElementById('language').textContent = navigator.language;
            document.getElementById('timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;

            const hasTouch = 'ontouchstart' in window;
            const touchSupportEl = document.getElementById('touch-support');
            touchSupportEl.textContent = hasTouch ? 'Yes' : 'No';
            touchSupportEl.className = 'config-value status-' + (hasTouch ? 'ok' : 'warning');

            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const mobileDeviceEl = document.getElementById('mobile-device');
            mobileDeviceEl.textContent = isMobile ? 'Yes' : 'No';
            mobileDeviceEl.className = 'config-value status-' + (isMobile ? 'ok' : 'warning');

            document.getElementById('user-agent').textContent = navigator.userAgent;

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

            document.getElementById('url').textContent = window.location.href;
            document.getElementById('title').textContent = document.title;
            const readyStateEl = document.getElementById('ready-state');
            readyStateEl.textContent = document.readyState;
            readyStateEl.className = 'config-value status-' + (document.readyState === 'complete' ? 'ok' : 'warning');

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

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
        window.addEventListener('resize', updateValues);
        updateValues();
    </script>
</body>
</html>`;
}
