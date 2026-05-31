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

**Deploy update** (after `git push` — rebuild app only, keeps Postgres/Redis data)

```bash
cd ~/flatgigs-backend   # local: cd ~/Developer/flatgigs-backend
git pull
docker compose build app
docker compose up -d app
```

Do **not** use `docker compose down -v` unless you want to wipe the database.

If you added Prisma migrations:

```bash
docker compose exec app npx prisma migrate deploy
```

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

Search (GET): see [`SEARCH.md`](SEARCH.md) for query params, response shape, and frontend caching.

## Env

| Variable | Required |
|----------|----------|
| `PORT` | default `4000` |
| `DATABASE_URL` | yes |
| `REDIS_URL` | yes |
| `OPENAI_API_KEY` | yes (chat + embeddings) |
| `CORS_ORIGIN` | optional — omit or `*` = allow all; comma-list to restrict |

### Cache TTLs (optional, seconds)

All default to sensible values in [`src/config.ts`](src/config.ts). Override in production to tune Redis caching.

| Variable | Default | Used for |
|----------|---------|----------|
| `CACHE_SEARCH_TTL_SECONDS` | 900 | Search results (REST + AI DB layer) |
| `CACHE_TOP_PICKS_TTL_SECONDS` | 3600 | Homepage top picks |
| `CACHE_LISTING_TTL_SECONDS` | 86400 | Listing detail |
| `CACHE_CITIES_TTL_SECONDS` | 86400 | Cities list |
| `CACHE_WISHLIST_TTL_SECONDS` | 300 | Wishlist per token |
| `CACHE_SUMMARY_TTL_SECONDS` | 86400 | Batch listing summaries |
| `CACHE_RATIONALE_TTL_SECONDS` | 86400 | AI search rationales |
| `CACHE_COMPARE_TTL_SECONDS` | 3600 | Compare endpoint |
| `CACHE_CHAT_TTL_SECONDS` | 1200 | WebSocket chat session |
| `CACHE_TRACE_TTL_SECONDS` | 3600 | Agent debug traces |

Ingest automatically flushes search, listing, cities, compare, rationale, and wishlist caches when data reload completes.

See [`.env.docker.example`](.env.docker.example) for Docker. Other settings: [`src/config.ts`](src/config.ts).
