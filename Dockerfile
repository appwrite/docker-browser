# debian so we can re-use!
FROM oven/bun:1.3.2-debian AS base

WORKDIR /app

COPY package.json bun.lock ./
COPY src/utils/clean-modules.ts ./src/utils/clean-modules.ts

RUN bun install --frozen-lockfile --production && \
    bun run ./src/utils/clean-modules.ts && \
    rm -rf ~/.bun/install/cache /tmp/*

# well-known OSS docker image
FROM chromedp/headless-shell AS final

# install fonts only
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      tini \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-wqy-zenhei && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /var/cache/apt/archives/*

# copy bun from debian base above!
COPY --from=base /usr/local/bin/bun /usr/local/bin/bun

# Add chrome user
RUN groupadd -r chrome && useradd -r -g chrome chrome

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/headless-shell/headless-shell \
    NODE_ENV=production

WORKDIR /app

COPY --chown=chrome:chrome src/ ./src/
COPY --chown=chrome:chrome package.json ./
COPY --chown=chrome:chrome --from=base /app/node_modules ./node_modules

# for e2e tests and `reports` endpoint!
RUN install -d -o chrome -g chrome lighthouse

USER chrome

ENTRYPOINT ["tini", "--"]
CMD ["bun", "run", "src/server.ts"]
