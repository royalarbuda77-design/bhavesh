# ── build stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# build-time placeholder secrets are fine; real ones come from env at runtime
RUN npm run build

# ── runtime stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/app.db
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# non-root user
RUN addgroup -S nexus && adduser -S nexus -G nexus && mkdir -p /app/data && chown -R nexus:nexus /app
USER nexus

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

# persistent volume for the SQLite database (chats, users, encrypted keys)
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["npm", "run", "start"]
