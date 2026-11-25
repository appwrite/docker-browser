# debian so we can re-use!
FROM oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e AS base

WORKDIR /app

COPY package.json bun.lock ./
COPY src/utils/clean-modules.ts ./src/utils/clean-modules.ts

RUN bun install --frozen-lockfile --production && \
    bun run ./src/utils/clean-modules.ts && \
    rm -rf ~/.bun/install/cache /tmp/*

# well-known OSS docker image
FROM chromedp/headless-shell:159.0.8154.6@sha256:0a09ac93fbc9e0849dc2bc178fc29e0a9c1ff0b79ca64c03b46dbc0757b3c3ac AS final

# install Debian security updates, fonts, and the patched Brotli decoder
RUN apt-get update && \
    apt-get upgrade -y --no-install-recommends && \
    apt-get install -y --no-install-recommends \
      tini \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-wqy-zenhei \
      libbrotli1 && \
    # CVE-2026-111497: refuse to build on a Brotli decoder older than the Debian fix
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libbrotli1)" ge 1.1.0-2+deb13u1 && \
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
