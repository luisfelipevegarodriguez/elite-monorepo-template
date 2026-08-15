FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @repo/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
