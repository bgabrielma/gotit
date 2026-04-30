FROM node:22.16-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY scripts ./scripts

ENV NODE_ENV=production
WORKDIR /app/packages/api

CMD ["pnpm", "exec", "tsx", "src/server.ts"]
