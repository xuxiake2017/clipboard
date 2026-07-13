FROM node:25-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:25-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_PUBLIC_PATH=
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_PUBLIC_PATH=${NEXT_PUBLIC_PUBLIC_PATH}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:25-slim AS runner
WORKDIR /app

ARG NEXT_PUBLIC_PUBLIC_PATH=
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SQLITE_PATH=/app/data/clipboard.sqlite
ENV NEXT_PUBLIC_PUBLIC_PATH=${NEXT_PUBLIC_PUBLIC_PATH}

RUN mkdir -p /app/data /app/public/uploads

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
VOLUME ["/app/data", "/app/public/uploads"]

CMD ["npm", "start"]
