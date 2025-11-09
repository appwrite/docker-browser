FROM node:22.13.1-alpine3.20 AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm@10.20.0 && \
    npm install -g modclean

RUN pnpm install --prod --frozen-lockfile && \
    pnpm prune --prod && \
    modclean --patterns default:safe --no-progress --run && \
    rm -rf ~/.pnpm ~/.npm /tmp/* /var/cache/apk/*

FROM node:22.13.1-alpine3.20

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
USER chrome

COPY package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY src/ ./src/

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/index.js"]
