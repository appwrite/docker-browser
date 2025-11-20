# debian so we can re-use!
FROM oven/bun:1.3.2-debian AS base

WORKDIR /app

COPY package.json bun.lock ./
COPY src/utils/clean-modules.ts ./src/utils/clean-modules.ts

RUN bun install --frozen-lockfile --production && \
    bun run ./src/utils/clean-modules.ts && \
    rm -rf ~/.bun/install/cache /tmp/*

# well-known OSS docker image
FROM chromedp/headless-shell:143.0.7445.3 AS chromedp

ARG TARGETARCH

# install required packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      tini \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-wqy-zenhei && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /var/cache/apt/archives/*

# cleanup unnecessary files
# based on target architecture
RUN ARCH=$(case ${TARGETARCH} in \
      amd64) echo "x86_64-linux-gnu" ;; \
      arm64) echo "aarch64-linux-gnu" ;; \
      *) echo "aarch64-linux-gnu" ;; \
    esac) && \
    \
    rm -rf \
      /usr/lib/${ARCH}/gconv/* \
      /usr/lib/${ARCH}/security/* \
      /usr/share/zoneinfo/* \
      /usr/lib/apt/* \
      /usr/lib/${ARCH}/perl-base \
      /usr/share/perl5 \
      /usr/share/doc \
      /usr/share/bash-completion && \
    \
    rm -f \
      /usr/bin/apt* \
      /usr/bin/dpkg* \
      /usr/bin/bash \
      /usr/bin/perl* \
      /usr/bin/openssl \
      /usr/bin/sqv \
      /usr/bin/tini-static && \
    \
    rm -f \
      /usr/lib/${ARCH}/libapt-pkg.so.* \
      /usr/lib/${ARCH}/libapt-private.so.* \
      /usr/lib/${ARCH}/libcrypto.so.* \
      /usr/lib/${ARCH}/libssl.so.* \
      /usr/lib/${ARCH}/libdb-5.3.so

# cleanup swiftshader
# NOTE: comment out if causes issues
RUN rm -f \
    /headless-shell/libvk_swiftshader.so \
    /headless-shell/vk_swiftshader_icd.json \
    /headless-shell/run.sh

# squash layers
FROM scratch AS final
COPY --from=chromedp / /
COPY --from=base /usr/local/bin/bun /usr/local/bin/bun

# add chrome user
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
