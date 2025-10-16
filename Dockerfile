# Multi-stage build for TypeScript Node app with FFmpeg and Prisma

FROM node:20-bullseye AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json yarn.lock ./
RUN yarn install

# Copy sources
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

# Build TS and generate Prisma client
RUN yarn build && npx prisma generate


FROM node:20-bullseye-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# FFmpeg is required by fluent-ffmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy only needed artifacts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Default runtime envs (override at run-time)
ENV MINIO_USE_SSL=false \
    PORT=3000

# Start the compiled app
CMD ["node", "dist/index.js"]



