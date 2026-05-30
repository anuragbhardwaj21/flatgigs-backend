# FlatGigs Backend

AI-native travel stays API (Express, Prisma, PostgreSQL + pgvector, Redis, WebSocket).

## Prerequisites

- Node 20+
- Yarn
- PostgreSQL with `vector` extension
- Redis
- OpenAI API key (ingest embeddings, compare, AI chat)

## Setup

```bash
cp .env.example .env
yarn install
yarn install
yarn prisma:migrate
```

Enable pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Data

Place Inside Airbnb files under `data/raw/{lisbon,barcelona}/`. See [data/README.md](data/README.md).

```bash
yarn ingest
```

Re-runnable per city (clears city listings before reload).

**Supabase ingest:** set `DIRECT_DATABASE_URL` (Database → Direct connection, port 5432) for bulk writes. Keep `DATABASE_URL` on Session pooler (5432) for the API. If you see `read-only transaction`, resume the project in the Supabase dashboard (paused / quota) or ingest against local Postgres first.

## Run

```bash
yarn dev
```

- REST: `http://localhost:4000/api/v1`
- Chat (frontend): [docs/chat-frontend.md](docs/chat-frontend.md)
- Health: `GET /health`
- WebSocket: `ws://localhost:4000/ws?token=<uuid-v4>`
- Header: `X-Token: <uuid-v4>` on protected REST routes

## Config

Secrets in `.env`: `PORT`, `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`.

All other settings: [src/config.ts](src/config.ts).

## Docker (optional)

```bash
docker compose up -d
```

Use `DATABASE_URL=postgresql://flatgigs:flatgigs@localhost:5432/flatgigs?schema=public` when using compose Postgres.

## Scripts


| Command                 | Description                                 |
| ----------------------- | ------------------------------------------- |
| `GET /api/v1/top-picks` | Curated top stays (`?city=lisbon&limit=12`) |
| `yarn dev`              | Dev server                                  |
| `yarn ingest`           | Load CSV data                               |
| `yarn build`            | Compile TypeScript                          |
| `yarn start`            | Production server                           |


