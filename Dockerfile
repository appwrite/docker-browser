FROM oven/bun:1.3.2-alpine AS base

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --production && \
    rm -rf ~/.bun/install/cache /tmp/*

FROM oven/bun:1.3.2-alpine AS final

RUN apk upgrade --no-cache --available && \
    apk add --no-cache \
      chromium \
      ttf-freefont \
      font-noto-emoji \
      tini && \
    apk add --no-cache font-wqy-zenhei --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community && \
    # remove unnecessary chromium files to save space
    rm -rf /usr/lib/chromium/chrome_crashpad_handler \
           /usr/lib/chromium/chrome_200_percent.pak \
           /usr/lib/chromium/chrome_100_percent.pak \
           /usr/lib/chromium/xdg-mime \
           /usr/lib/chromium/xdg-settings \
           /usr/lib/chromium/chrome-sandbox

RUN addgroup -S chrome && adduser -S -G chrome chrome

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app

COPY package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY src/ ./src/

RUN chown -R chrome:chrome /app

USER chrome

ENTRYPOINT ["tini", "--"]
CMD ["bun", "run", "src/server.ts"]
