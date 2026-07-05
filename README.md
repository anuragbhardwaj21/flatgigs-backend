# FlatGigs Backend

Production API for **FlatGigs** — an AI-assisted short-term rental discovery platform. Powers natural-language trip planning, filtered search, listing detail, wishlists, and mock bookings over real Airbnb-style inventory for **Lisbon** and **Barcelona** ([Inside Airbnb](https://insideairbnb.com/) data).

This is the **backend only**. A separate frontend consumes the REST and WebSocket APIs below.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Deploy Commands](#2-deploy-commands)
3. [EC2 Deployment](#3-ec2-deployment)
4. [Prerequisites](#4-prerequisites)
5. [Local Development](#5-local-development)
6. [Architecture](#6-architecture)
7. [Environment Variables](#7-environment-variables)
8. [API Reference](#8-api-reference)
9. [Troubleshooting](#9-troubleshooting)
10. [Chat Eval](#10-chat-eval)

---

## 1. Quick Start

```bash
git clone <repository-url>
cd flatgigs-backend
cp .env.example .env
# Edit .env — set OPENAI_API_KEY=sk-...
yarn deploy:ingest
```

First ingest takes **1–3 hours** (download + embeddings). Watch progress:

```bash
docker compose logs -f ingest
```

Verify:

```bash
curl http://localhost:4000/health
# → {"status":"ok"}
```

---

## 2. Deploy Commands

Both commands run `git pull --ff-only` first, then check prerequisites.

| Command | Use case | What it does |
|---------|----------|--------------|
| `yarn deploy:ingest` | First-time setup or full data refresh | Pull → start Postgres + Redis + app → download CSVs → ingest → restart app |
| `yarn deploy` | Code update on running server | Pull → rebuild and restart app (migrations run on app startup) |

### First-time / data refresh

```bash
yarn deploy:ingest
```

### Code update (no re-ingest)

```bash
yarn deploy
```

Takes ~1–2 minutes. Postgres, Redis, and existing data are preserved.

---

## 3. EC2 Deployment

### Instance setup

| Setting | Recommendation |
|---------|----------------|
| Instance | `t3.medium` or larger |
| Disk | 30 GB+ |
| OS | Ubuntu 22.04 / 24.04 |

**Security group inbound:**

| Port | Purpose |
|------|---------|
| 22 | SSH |
| 4000 | API + WebSocket |

Do not expose Postgres (5433) or Redis (6379) publicly.

### Install Docker (one time)

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker $USER
newgrp docker
```

Install Yarn (only needed to run deploy scripts):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn
```

### Deploy

```bash
git clone <repository-url> flatgigs-backend
cd flatgigs-backend
cp .env.example .env
nano .env   # set OPENAI_API_KEY
yarn deploy:ingest
```

After code changes:

```bash
yarn deploy
```

---

## 4. Prerequisites

Deploy scripts check these automatically. If missing, install commands are printed.

| Requirement | Checked by |
|-------------|------------|
| `git` | `git pull --ff-only` |
| `docker` (daemon running) | `docker info` |
| `docker compose` | `docker compose version` |
| `curl` | health check polling |
| `.env` with `OPENAI_API_KEY` | required for `deploy:ingest` |

**Ubuntu/Debian install all at once:**

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl
```

**macOS:** install [Docker Desktop](https://docs.docker.com/desktop/).

---

## 5. Local Development

Run Postgres + Redis in Docker, API with hot reload on the host:

```bash
cp .env.example .env
# Uncomment local DATABASE_URL / REDIS_URL in .env (localhost:5433, localhost:6379)
docker compose up -d postgres redis
yarn install
yarn prisma:migrate
yarn dev
```

Server: `http://localhost:4000/api/v1`

### Useful scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | API with hot reload |
| `yarn build` | Compile TypeScript |
| `yarn start` | Run compiled server |
| `yarn ingest:download` | Download CSVs to `data/raw/` |
| `yarn ingest` | Load CSVs into Postgres (local) |
| `yarn prisma:migrate` | Create/apply dev migrations |
| `yarn prisma:deploy` | Apply migrations (production) |

### Docker services only

```bash
docker compose up -d              # postgres + redis + app
docker compose logs -f app
docker compose down               # stop (keeps data)
docker compose down -v            # stop + wipe DB volumes
```

---

## 6. Architecture

```
┌─────────────┐     REST (JSON)      ┌──────────────────────────────────┐
│   Client    │◄────────────────────►│  Express API  (/api/v1)          │
│  (Frontend) │                      │  Routes → Services → Prisma      │
└──────┬──────┘                      └───────────┬──────────────────────┘
       │ WebSocket (/ws)                         │
       ▼                                         ▼
┌─────────────┐                      ┌──────────────────┐   ┌─────────────┐
│  WS Chat    │──► Agent graph ─────►│  PostgreSQL 16   │   │   Redis 7   │
│  Handler    │                      │  + pgvector      │   │  (caching)  │
└─────────────┘                      └──────────────────┘   └─────────────┘
                                           ▲
                                           │ ingest pipeline
                                    ┌──────┴──────┐
                                    │ Inside      │
                                    │ Airbnb CSV  │
                                    └─────────────┘
```

### Deploy flow

```
yarn deploy:ingest
  → git pull
  → docker compose up -d --build     (postgres, redis, app)
  → app entrypoint: wait → migrate → pgvector → start server
  → ingest container: download CSVs → load data
  → docker compose restart app
  → health check on :4000
```

### Folder structure

```
flatgigs-backend/
├── src/                    # Express API, services, agents, WebSocket
├── scripts/
│   ├── deploy.sh           # yarn deploy
│   ├── deploy-ingest.sh    # yarn deploy:ingest
│   ├── lib/deploy-common.sh
│   ├── docker/             # Container entrypoint, ingest, wait-for
│   └── ingest/             # Download + load pipeline (TypeScript)
├── prisma/                 # Schema + migrations
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

### Stack

Node 20, TypeScript, Express, Prisma, PostgreSQL 16 + pgvector, Redis 7, OpenAI (gpt-4o-mini, text-embedding-3-small), WebSocket.

---

## 7. Environment Variables

Copy `.env.example` to `.env`.

### Required

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI key (required for ingest embeddings + AI endpoints) |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |

### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP listen port |
| `NODE_ENV` | `production` | Set in Docker automatically |
| `CORS_ORIGIN` | allow all | Comma-separated frontend origins |

### Optional — ingest

| Variable | Description |
|----------|-------------|
| `LISBON_SNAPSHOT` | Inside Airbnb snapshot date (default `2025-12-25`) |
| `BARCELONA_SNAPSHOT` | Inside Airbnb snapshot date (default `2025-12-14`) |
| `FORCE_DOWNLOAD` | `1` to re-download CSVs even if cached |

### Optional — cache TTLs (seconds)

| Variable | Default |
|----------|---------|
| `CACHE_SEARCH_TTL_SECONDS` | 900 |
| `CACHE_TOP_PICKS_TTL_SECONDS` | 3600 |
| `CACHE_LISTING_TTL_SECONDS` | 86400 |
| `CACHE_CITIES_TTL_SECONDS` | 86400 |
| `CACHE_WISHLIST_TTL_SECONDS` | 300 |
| `CACHE_SUMMARY_TTL_SECONDS` | 86400 |
| `CACHE_RATIONALE_TTL_SECONDS` | 86400 |
| `CACHE_COMPARE_TTL_SECONDS` | 3600 |
| `CACHE_CHAT_TTL_SECONDS` | 1200 |
| `CACHE_TRACE_TTL_SECONDS` | 3600 |

---

## 8. API Reference

**Base URL:** `http://localhost:4000/api/v1`  
**Auth:** `X-Token: <uuid-v4>` on all `/api/v1/*` routes  
**Health (public):** `GET /health`  
**WebSocket:** `ws://localhost:4000/ws?token=<uuid-v4>`

### Response envelope

```json
{
  "data": { },
  "success": true,
  "meta": { "code": 200, "message": "OK" }
}
```

### REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness (no auth) |
| `GET` | `/cities` | Supported cities |
| `GET` | `/top-picks` | Curated listings (`?city=`, `?limit=`) |
| `GET` | `/search` | Structured search |
| `GET` | `/listings/:id` | Listing detail |
| `GET` | `/listings/:id/calendar` | Availability (`?from=`, `?to=`) |
| `GET` | `/listings/:id/price-quote` | Stay pricing (`?checkIn=`, `?checkOut=`) |
| `GET` | `/listings/:id/reviews` | Paginated reviews |
| `GET` | `/chat` | REST view of chat session |
| `POST` | `/wishlist` | Add listing `{ "listingId": "..." }` |
| `GET` | `/wishlist` | List saved listings |
| `DELETE` | `/wishlist/:listingId` | Remove saved listing |
| `POST` | `/compare` | Compare 2–5 listings |
| `POST` | `/batch/summaries` | Batch summaries (max 20 IDs) |
| `POST` | `/reservations/mock` | Mock booking confirmation |
| `GET` | `/agents/traces/:requestId` | Agent debug trace |

### Search parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `city` | yes | `lisbon` or `barcelona` |
| `checkIn`, `checkOut` | yes | ISO date `YYYY-MM-DD` |
| `adults`, `children`, `rooms` | no | Guest counts |
| `priceMin`, `priceMax` | no | Nightly price bounds |
| `ratingMin` | no | Minimum rating (0–5) |
| `propertyTypes`, `amenities` | no | Filters |
| `sort` | no | `price_asc`, `price_desc`, `rating`, `popularity`, `distance` |
| `lat`, `lng` | no | Reference for distance sort |
| `bounds` | no | Map bounds `neLat,neLng,swLat,swLng` |
| `page`, `limit` | no | Pagination (max limit 50) |

**Example:**

```bash
curl -H "X-Token: 550e8400-e29b-41d4-a716-446655440000" \
  "http://localhost:4000/api/v1/search?city=lisbon&checkIn=2026-06-10&checkOut=2026-06-15&adults=2&limit=10"
```

### WebSocket events

**Client → Server**

| Event | Payload |
|-------|---------|
| `ping` | — |
| `chat.start` | `{ "query": "..." }` |
| `chat.message` | `{ "message": "..." }` |
| `chat.cancel` | — |

**Server → Client**

| Event | Description |
|-------|-------------|
| `connected` | Connection acknowledged |
| `pong` | Heartbeat |
| `assistant.history` | Session replay on reconnect |
| `assistant.status` | Agent progress |
| `state.updated` | Parsed filters and phase |
| `assistant.message` | Concierge text |
| `assistant.results` | Search results with rationales |
| `citation` | Review excerpts |
| `step_started` / `step_completed` | Agent step timing |
| `done` | Turn complete |
| `error` | Error envelope |

---

## 9. Troubleshooting

### Docker build: lockfile needs to be updated

```
Your lockfile needs to be updated, but yarn was run with --frozen-lockfile
```

Pull latest code (includes fixed `yarn.lock`), or locally run `yarn install` and commit.

### Health check times out

```bash
docker compose logs -f app
```

Common causes: Postgres not ready, missing `.env`, `PORT` mismatch (must be `4000` in Docker).

### Port 4000 in use

Change `PORT` in `.env` and update `docker-compose.yml` port mapping to match.

### Postgres port conflict on host

Docker maps Postgres to host port **5433** (not 5432) to avoid clashing with local Postgres.

### Ingest failed or slow

```bash
docker compose logs ingest
```

First run downloads large CSVs and generates embeddings — expect 1–3 hours. Requires valid `OPENAI_API_KEY`.

### Re-run ingest only

```bash
yarn deploy:ingest
```

Or manually:

```bash
COMPOSE_PROFILES=tools docker compose run --rm ingest
docker compose restart app
```

### Wipe everything and start fresh

```bash
docker compose down -v --rmi local
yarn deploy:ingest
```

---

## 10. Chat Eval

Manual smoke tests. Requires `OPENAI_API_KEY`, Redis, Postgres with Lisbon/Barcelona data, server running.

### Golden queries

1. **Full NL start** — `chat.start` `{ "query": "Lisbon 2026-06-10 to 2026-06-15 for 2 adults" }`  
   Expect: `state.updated` → `assistant.results` with `total > 0`, each item has `rationale`.

2. **Clarifying** — `chat.start` `{ "query": "I want to visit Lisbon" }`  
   Expect: `assistant.message` `messageType: question`, no `assistant.results`.

3. **Force search** — after partial slots, `chat.message` `{ "message": "just show me listings" }` with mandatory filled  
   Expect: `assistant.results` without optional questions.

4. **Review follow-up** — after search, `chat.message` `{ "message": "what do reviews say?" }`  
   Expect: `citation` events, `done`, `assistant.message` answer.

5. **Reconnect** — complete one search, disconnect WS, reconnect same token within 20m  
   Expect: `assistant.history` with messages. No live `assistant.results`.

### Trace

After any turn, copy `meta.requestId` from `assistant.results`:

```bash
curl -H "X-Token: <uuid>" http://localhost:4000/api/v1/agents/traces/<requestId>
```

Expect non-empty `steps` with `intent` and `retrieval`.

### REST parity

`GET /api/v1/chat` with same `X-Token` should match `assistant.history` messages and `expiresAt`.
