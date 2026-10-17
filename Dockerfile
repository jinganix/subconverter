# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/node/package.json ./packages/node/package.json
COPY packages/browser/package.json ./packages/browser/package.json
COPY packages/cli/package.json ./packages/cli/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=25500
ENV HOST=0.0.0.0
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/node/package.json ./packages/node/package.json
COPY packages/browser/package.json ./packages/browser/package.json
COPY packages/cli/package.json ./packages/cli/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/node/dist ./packages/node/dist
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist

EXPOSE 25500
CMD ["node", "packages/cli/dist/cli.js", "serve"]
