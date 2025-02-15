FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY . .

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
RUN pnpm playwright install --with-deps chromium
COPY --from=build /app/src/index.js /app/src/index.js
CMD ["pnpm", "start"]