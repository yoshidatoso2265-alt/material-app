# ============================================================
# material-app Dockerfile
# ============================================================

FROM node:20-slim AS base

# ============================================================
# Stage 1: フロントエンドビルド
# ============================================================
FROM base AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: バックエンドビルド
# ============================================================
FROM base AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ============================================================
# Stage 3: 本番イメージ
# ============================================================
FROM base AS production

# Playwright用のシステム依存
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# バックエンド本番依存のみインストール
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Playwrightブラウザインストール
RUN cd backend && npx playwright install chromium

# ビルド済みファイルをコピー
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# データ・ストレージディレクトリ
RUN mkdir -p backend/data backend/storage

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
