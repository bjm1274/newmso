# ============================================================
# Dockerfile for AllERP (Next.js Standalone + SQLite + WebSocket + Cron)
# ============================================================

FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
ENV SESSION_SECRET="allerp-mso-unified-session-secret-2026-production-v1"

# 1. 의존성 설치 단계
FROM base AS deps
WORKDIR /app

# better-sqlite3 컴파일용 필수 도구 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev

# 2. 빌드 단계
FROM base AS builder
WORKDIR /app

# 빌드 시 better-sqlite3가 네이티브 모듈로 필요할 수 있으므로 컴파일 도구 유지
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js Standalone 빌드
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. 프로덕션 실행 단계
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH="/app/data/allerp.sqlite"

# sqlite3 런타임 라이브러리 및 헬스체크용 curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 볼륨 디렉터리 생성
RUN mkdir -p /app/data /app/backups

# Next.js standalone 산출물 및 정적 파일 복사
COPY --from=builder /app/.next/standalone ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.mjs"]
