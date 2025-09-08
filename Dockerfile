# install and optimize dependencies
FROM zenika/alpine-chrome:with-node AS base

WORKDIR /app

# copy package files
COPY package.json pnpm-lock.yaml ./

# install pnpm as root,
# then switch back to chrome user
USER root
RUN npm install -g pnpm@10

# install dependencies as normal user
USER chrome
RUN pnpm install --prod --frozen-lockfile && \
    pnpm prune --prod && \
    # remove unnecessary files to reduce image size
    find /app/node_modules -name "*.md" -delete && \
    find /app/node_modules -type d -name "test*" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -type d -name "doc*" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name ".cache" -type d -exec rm -rf {} + 2>/dev/null || true && \
    # clean up caches
    rm -rf ~/.pnpm ~/.npm /tmp/* /var/cache/apk/*

# production stage
FROM zenika/alpine-chrome:with-node

# environment configuration
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app
USER chrome

# copy application files
COPY package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY src/index.js ./src/

# start the application
CMD ["node", "src/index.js"]
