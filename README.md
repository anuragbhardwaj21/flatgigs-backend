# FlatGigs Backend

AI travel stays API — Express, PostgreSQL + pgvector, Redis, WebSocket chat.

## Stack

Node 20 · Prisma · OpenAI · Inside Airbnb data (Lisbon + Barcelona)

## Docker (recommended)

Requires Docker only. Ingest downloads data, runs migrations, loads DB (~1–3 hours).

```bash
cd ~/Developer/flatgigs-backend   # EC2: cd ~/flatgigs-backend
git pull
cp .env.docker.example .env
nano .env                          # set OPENAI_API_KEY
docker compose up -d --build
curl http://localhost:4000/health
chmod +x scripts/docker/run-ingest.sh
./scripts/docker/run-ingest.sh
```

Ingest stops the app, loads data, then restarts it automatically.

**Cleanup / rebuild**

```bash
docker compose down --rmi local
docker rm -f $(docker ps -aq --filter "name=flatgigs") 2>/dev/null || true
docker builder prune -f
docker compose up -d --build
```

**Full reset** (wipes DB + cached downloads)

```bash
docker compose down -v --rmi local && docker builder prune -f
```

| Command | Description |
|---------|-------------|
| `docker compose logs -f app` | App logs |
| `docker compose down` | Stop all |
| `yarn docker:ingest` | Re-run ingest pipeline |

Host Postgres port: **5433** (avoids conflict with local Postgres on 5432).

## Local dev (without Docker app)

```bash
cp .env.example .env
docker compose up -d postgres redis
yarn install && yarn prisma:migrate
yarn dev
```

Set `DATABASE_URL=postgresql://flatgigs:flatgigs@localhost:5433/flatgigs?schema=public` and `REDIS_URL=redis://localhost:6379`.

## API

| | |
|--|--|
| REST | `http://localhost:4000/api/v1` |
| Health | `GET /health` |
| WebSocket | `ws://localhost:4000/ws?token=<uuid-v4>` |
| Auth header | `X-Token: <uuid-v4>` |

## Env

| Variable | Required |
|----------|----------|
| `PORT` | default `4000` |
| `DATABASE_URL` | yes |
| `REDIS_URL` | yes |
| `OPENAI_API_KEY` | yes (chat + embeddings) |

See [`.env.docker.example`](.env.docker.example) for Docker. Other settings: [`src/config.ts`](src/config.ts).
