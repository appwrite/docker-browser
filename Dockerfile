FROM oven/bun:1.3.2-alpine AS base

WORKDIR /app

COPY package.json bun.lock ./
COPY src/utils/clean-modules.ts ./src/utils/clean-modules.ts

RUN bun install --frozen-lockfile --production && \
    bun run ./src/utils/clean-modules.ts && \
    rm -rf ~/.bun/install/cache /tmp/*

FROM oven/bun:1.3.2-alpine AS final

RUN apk upgrade --no-cache --available && \
    apk add --no-cache \
      chromium \
      ttf-freefont \
      font-noto-emoji \
      tini \
      upx && \
    apk add --no-cache font-wqy-zenhei --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community && \
    # Compress chromium with UPX
    upx --best --lzma /usr/lib/chromium/chromium 2>/dev/null || true && \
    # Remove UPX after compression
    apk del upx && \
    rm -rf /usr/lib/chromium/chrome_200_percent.pak \
           /usr/lib/chromium/chrome_100_percent.pak \
           /usr/lib/chromium/xdg-mime \
           /usr/lib/chromium/xdg-settings \
           /usr/lib/chromium/chrome-sandbox && \
    # Clean up caches
    rm -rf /var/cache/apk/* /tmp/* /root/.cache

RUN addgroup -S chrome && adduser -S -G chrome chrome

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app
USER chrome

COPY package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY src/ ./src/

ENTRYPOINT ["tini", "--"]
CMD ["bun", "run", "src/server.ts"]
