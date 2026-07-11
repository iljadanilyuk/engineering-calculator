FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY backend/package.json backend/package.json
COPY webapp/package.json webapp/package.json
COPY website/package.json website/package.json

RUN bun install --frozen-lockfile
RUN bun x playwright install --with-deps chromium

COPY packages/contracts packages/contracts
COPY backend backend

WORKDIR /app/backend

RUN DATABASE_URL="postgresql://superuser:superpassword@localhost:5432/poznyak_engineering_calculator?schema=public" bun run prisma:generate

ENV NODE_ENV=production

CMD ["bun", "run", "start"]
