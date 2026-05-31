# FlatGigs Backend

Production API for **FlatGigs** — an AI-assisted short-term rental discovery platform. The service powers natural-language trip planning, filtered search, listing detail, wishlists, and mock bookings over real Airbnb-style inventory for **Lisbon** and **Barcelona**, sourced from [Inside Airbnb](https://insideairbnb.com/).

This repository is the **backend only**. A separate frontend (React/Next.js) consumes the REST and WebSocket APIs documented below.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Getting Started](#4-getting-started)
5. [Running the Project](#5-running-the-project)
6. [Folder Structure](#6-folder-structure)
7. [Core Features](#7-core-features)
8. [Application Flow](#8-application-flow)
9. [API Overview](#9-api-overview)
10. [Development Guidelines](#10-development-guidelines)
11. [Deployment](#11-deployment)
12. [Troubleshooting](#12-troubleshooting)
13. [Future Improvements](#13-future-improvements)

---

## 1. Project Overview

### What it does

FlatGigs Backend exposes a versioned REST API and a WebSocket channel for an AI travel concierge. Users describe trips in plain language; the concierge extracts structured search criteria, queries PostgreSQL for available listings, and returns ranked results with AI-generated rationales. Supporting endpoints cover listing detail, calendar pricing, reviews, wishlists, comparisons, and mock reservations.

### Business purpose

Short-term rental search is filter-heavy and opaque. FlatGigs reduces friction by letting travelers search conversationally while still offering traditional structured search, map pins, facets, and review intelligence — all backed by real market data rather than synthetic listings.

### Core use cases

| Use case | How |
|----------|-----|
| Conversational trip search | WebSocket `chat.start` / `chat.message` with AI concierge |
| Structured search | `GET /api/v1/search` with dates, filters, sort, map bounds |
| Browse curated listings | `GET /api/v1/top-picks` |
| Listing research | Detail, calendar, reviews, price quotes |
| Save favorites | Token-scoped wishlist (PostgreSQL + Redis cache) |
| Compare options | AI verdict across 2–5 listings |
| Mock booking | `POST /api/v1/reservations/mock` returns a confirmation ID |
| Debug AI turns | `GET /api/v1/agents/traces/:requestId` |

### Target users

- **Travelers** — discover and compare stays via a frontend client
- **Frontend engineers** — integrate REST/WebSocket contracts
- **Platform / ML engineers** — extend agents, ingest pipeline, or search
- **Stakeholders** — evaluate AI-assisted search over real inventory data

---

## 2. Architecture Overview

### High-level design

```
┌─────────────┐     REST (JSON)      ┌──────────────────────────────────┐
│   Client    │◄────────────────────►│  Express API  (/api/v1)          │
│  (Frontend) │                      │  • Routes → Services → Prisma    │
└──────┬──────┘                      └───────────┬──────────────────────┘
       │                                         │
       │ WebSocket (/ws)                         │
       ▼                                         ▼
┌─────────────┐                      ┌──────────────────┐   ┌─────────────┐
│  WS Chat    │──► Agent graph ─────►│  PostgreSQL 16   │   │   Redis 7   │
│  Handler    │    (concierge,       │  + pgvector ext  │   │  (caching,  │
└─────────────┘     retrieval,       │  Prisma ORM      │   │   sessions) │
                    review)          └──────────────────┘   └─────────────┘
                                           ▲
                                           │ ingest pipeline
                                    ┌──────┴──────┐
                                    │ Inside      │
                                    │ Airbnb CSV  │
                                    └─────────────┘
```

### System design approach

- **Layered Express app** — routes validate input (Zod), delegate to services, return a consistent JSON envelope.
- **Service layer** — business logic for search, listings, cities, chat sessions, and top picks.
- **Agent graph** — multi-step AI workflow (concierge → retrieval → optional review) orchestrated in `src/agents/graph.ts`, with trace persistence for observability.
- **Cache-aside Redis** — search bases, listing detail, top picks, compare verdicts, chat state, and agent traces are cached with configurable TTLs.
- **Data ingest** — offline pipeline downloads Inside Airbnb snapshots, runs Prisma migrations, loads CSVs in batches, enriches review summaries, and optionally generates OpenAI embeddings.

### Communication flow

1. **REST request** → CORS → JSON body parser → request ID → response helpers → token middleware (UUID) → route handler → service → Prisma/Redis → envelope response.
2. **WebSocket message** → JSON parse → token validation → `conversation.service` → agent graph → streaming events back to client.
3. **Ingest** → download CSVs → migrate DB → enable pgvector → stream-parse listings/calendar/reviews → flush Redis data caches → restart app.

### Data flow

```
Inside Airbnb CSVs
  → scripts/ingest/load-city.ts
  → cities, neighbourhoods, listings, calendar_days, reviews
  → (optional) listing_embeddings via OpenAI
  → PostgreSQL

User query (NL or structured)
  → slot extraction / query params
  → availability filter (calendar_days)
  → price aggregation (calendar pricing)
  → sort + facets + map pins
  → (AI chat) per-listing rationale via OpenAI
  → Redis cache → client
```

### External integrations

| Integration | Purpose |
|-------------|---------|
| **Inside Airbnb** | Listings, calendar, reviews, neighbourhood GeoJSON |
| **OpenAI** | Concierge NLU, search rationales, compare verdicts, review summaries, listing embeddings (ingest) |
| **PostgreSQL + pgvector** | Primary datastore; pgvector extension enabled for future vector search |
| **Redis** | Response caching, chat session state, trace hot cache |

### Scalability and performance

- **Redis cache-aside** reduces repeated search and listing DB load (TTLs tunable via env — see [Environment variables](#environment-variables)).
- **Search base caching** — full result sets are cached per filter set; pagination is applied in-memory from the cached base.
- **Batch ingest** — CSV streaming with configurable batch sizes (`listingBatchSize`, `calendarBatchSize`, `reviewBatchSize`).
- **Concurrent embedding** — ingest uses `p-limit(5)` for OpenAI embedding calls.
- **Horizontal scaling** — stateless API containers can scale behind a load balancer; Redis and Postgres are shared. WebSocket sessions require sticky routing or a shared Redis session store (already used for chat state).
- **Known limits** — AI chat and compare endpoints are latency-bound by OpenAI; ingest is I/O- and CPU-heavy (1–3 hours for full load).

---

## 3. Technology Stack

### Frontend (consumer)

This repo does not include a frontend. Clients are expected to use:

- REST with `X-Token` header
- WebSocket at `/ws?token=<uuid-v4>`

Typical consumer stack: React, Next.js, TypeScript, Redux Toolkit, TailwindCSS.

### Backend

| Technology | Role |
|------------|------|
| **Node.js 20** | Runtime |
| **TypeScript 5.7** | Language |
| **Express 4** | HTTP server |
| **ws** | WebSocket server |
| **Zod** | Request/env validation |
| **Prisma 6** | ORM and migrations |
| **tsx** | Dev-time TypeScript execution |

### Database

| Technology | Role |
|------------|------|
| **PostgreSQL 16** | Primary database |
| **pgvector** | Extension enabled at ingest (embeddings stored as `Float[]` today) |
| **Redis 7** | Cache and ephemeral chat sessions |

### Infrastructure and DevOps

| Tool | Role |
|------|------|
| **Docker / Docker Compose** | Recommended local and production deployment |
| **Multi-stage Dockerfile** | Build TypeScript → run compiled JS |
| **Alpine Linux** | Production base image |

### Third-party services

- **OpenAI API** — `gpt-4o-mini` (chat), `text-embedding-3-small` (ingest embeddings)
- **Inside Airbnb** — open data snapshots for Lisbon and Barcelona

---

## 4. Getting Started

### Prerequisites

| Requirement | Version / notes |
|-------------|-----------------|
| **Node.js** | 20.x |
| **Yarn** | 1.x (via Corepack) |
| **Docker + Compose** | Recommended for Postgres, Redis, and production-like runs |
| **OpenAI API key** | Required for AI chat, compare, rationales, and embedding ingest |

### Environment setup

**Option A — Full Docker (recommended)**

```bash
git clone <repository-url>
cd flatgigs-backend
cp .env.docker.example .env
# Edit .env and set OPENAI_API_KEY
docker compose up -d --build
curl http://localhost:4000/health
```

**Option B — Local Node dev (Postgres + Redis in Docker)**

```bash
cp .env.example .env
docker compose up -d postgres redis
yarn install
yarn prisma:migrate
yarn dev
```

### Installation

```bash
yarn install          # Install dependencies
yarn prisma:generate  # Generate Prisma client (also runs on build)
```

### Environment variables

Create `.env` from `.env.example` (local) or `.env.docker.example` (Docker).

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://flatgigs:flatgigs@localhost:5433/flatgigs?schema=public` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

#### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` (code default); Docker uses `4000` | HTTP listen port |
| `NODE_ENV` | `development` | `production` in Docker app service |
| `CORS_ORIGIN` | allow all | Comma-separated origins, or omit / `*` for all |

#### Optional — ingest

| Variable | Description |
|----------|-------------|
| `LISBON_SNAPSHOT` | Inside Airbnb snapshot date (default `2025-12-25`) |
| `BARCELONA_SNAPSHOT` | Inside Airbnb snapshot date (default `2025-12-14`) |
| `FORCE_DOWNLOAD` | `1` to re-download CSVs even if cached |

#### Optional — cache TTLs (seconds)

All defaults are defined in [`src/config.ts`](src/config.ts):

| Variable | Default | Used for |
|----------|---------|----------|
| `CACHE_SEARCH_TTL_SECONDS` | 900 | Search results |
| `CACHE_TOP_PICKS_TTL_SECONDS` | 3600 | Homepage top picks |
| `CACHE_LISTING_TTL_SECONDS` | 86400 | Listing detail |
| `CACHE_CITIES_TTL_SECONDS` | 86400 | Cities list |
| `CACHE_WISHLIST_TTL_SECONDS` | 300 | Wishlist per token |
| `CACHE_SUMMARY_TTL_SECONDS` | 86400 | Batch listing summaries |
| `CACHE_RATIONALE_TTL_SECONDS` | 86400 | AI search rationales |
| `CACHE_COMPARE_TTL_SECONDS` | 3600 | Compare endpoint |
| `CACHE_CHAT_TTL_SECONDS` | 1200 | WebSocket chat session |
| `CACHE_TRACE_TTL_SECONDS` | 3600 | Agent debug traces |

#### Local dev `.env` example

```env
PORT=4000
DATABASE_URL=postgresql://flatgigs:flatgigs@localhost:5433/flatgigs?schema=public
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-your-key-here
CORS_ORIGIN=http://localhost:5173
```

> **Note:** Docker Compose maps Postgres to host port **5433** to avoid conflicting with a local Postgres on 5432.

### Load data (first-time setup)

The API requires ingested listing data. After Docker is up:

```bash
chmod +x scripts/docker/run-ingest.sh
./scripts/docker/run-ingest.sh
# or
yarn docker:ingest
```

This stops the app container, runs the full ingest pipeline (download → migrate → load), then restarts the app. Expect **1–3 hours** on first run.

For local dev without the ingest container:

```bash
yarn ingest:download   # Download CSVs to data/raw/
yarn ingest            # Load into PostgreSQL
```

---

## 5. Running the Project

### Development mode

```bash
# Start Postgres + Redis
docker compose up -d postgres redis

# Run API with hot reload
yarn dev
```

Server output:

```
API http://0.0.0.0:4000/api/v1 WS /ws
```

### Production mode

```bash
yarn build
yarn start
# Runs: node dist/src/server.js
```

Or via Docker:

```bash
docker compose up -d --build
```

### Build commands

| Command | Description |
|---------|-------------|
| `yarn build` | Compile TypeScript to `dist/` |
| `yarn prisma:generate` | Regenerate Prisma client |
| `yarn prisma:migrate` | Create/apply dev migrations |
| `yarn prisma:deploy` | Apply migrations in production |

### Start commands

| Command | Description |
|---------|-------------|
| `yarn dev` | Dev server with `tsx watch` |
| `yarn start` | Production server |
| `docker compose up -d` | All services (app, postgres, redis) |

### Ingest commands

| Command | Description |
|---------|-------------|
| `yarn ingest:download` | Download Inside Airbnb CSVs |
| `yarn ingest` | Load data into PostgreSQL |
| `yarn docker:ingest` | Full Docker ingest pipeline |

### Testing

There is **no automated test suite** in this repository. Manual smoke tests for the AI chat flow are documented in [`EVAL.md`](EVAL.md).

Example health check:

```bash
curl http://localhost:4000/health
```

Example authenticated search (replace token with a UUID v4):

```bash
curl -H "X-Token: 550e8400-e29b-41d4-a716-446655440000" \
  "http://localhost:4000/api/v1/search?city=lisbon&checkIn=2026-06-10&checkOut=2026-06-15&adults=2"
```

---

## 6. Folder Structure

```
flatgigs-backend/
├── src/                          # Application source
│   ├── server.ts                 # Entry point — HTTP + WebSocket bootstrap
│   ├── app.ts                    # Express app factory (middleware, routes)
│   ├── config.ts                 # Env parsing, defaults, ingest config
│   ├── routes/                   # HTTP route handlers
│   │   ├── index.ts              # API router aggregation
│   │   ├── health.route.ts       # GET /health (public)
│   │   ├── cities.route.ts
│   │   ├── search.route.ts
│   │   ├── listings.route.ts
│   │   ├── top-picks.route.ts
│   │   ├── chat.route.ts
│   │   ├── wishlist.route.ts
│   │   ├── reservations.route.ts
│   │   ├── compare.route.ts
│   │   ├── batch.route.ts
│   │   └── agents.route.ts
│   ├── services/                 # Business logic
│   │   ├── search.service.ts
│   │   ├── listing.service.ts
│   │   ├── cities.service.ts
│   │   ├── top-picks.service.ts
│   │   ├── chat.service.ts       # Redis-backed chat session
│   │   ├── conversation.service.ts
│   │   ├── availability.query.ts
│   │   └── calendar-pricing.ts
│   ├── agents/                   # AI agent orchestration
│   │   ├── graph.ts              # Turn routing (concierge → retrieval → review)
│   │   ├── nodes/                # Agent steps
│   │   │   ├── concierge.ts
│   │   │   ├── retrieval.ts
│   │   │   └── review.ts
│   │   ├── tools.ts              # Slot → search param mapping
│   │   ├── slots.ts              # Slot merge / validation
│   │   ├── schemas.ts            # Zod schemas for agents
│   │   ├── status.ts             # WS status events
│   │   └── trace.service.ts      # Agent trace persistence
│   ├── ws/                       # WebSocket layer
│   │   ├── server.ts
│   │   ├── chat.handler.ts
│   │   └── ws-response.ts
│   ├── middleware/
│   │   ├── token.ts              # X-Token UUID validation
│   │   ├── api-response.ts       # res.success / res.fail helpers
│   │   ├── request-id.ts
│   │   └── error-handler.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── cache.ts
│   │   ├── openai.ts
│   │   └── api-response.ts       # Envelope types
│   └── types/
│       └── express.d.ts          # Express augmentation
├── scripts/
│   ├── ingest/                   # Data pipeline
│   │   ├── index.ts              # Ingest orchestrator
│   │   ├── download.ts           # Inside Airbnb downloader
│   │   ├── load-city.ts          # CSV → PostgreSQL loader
│   │   ├── stream-csv.ts
│   │   ├── amenities.ts
│   │   └── enrich.ts             # Review aspect scoring
│   └── docker/                   # Container helpers
│       ├── entrypoint.sh
│       ├── bootstrap-ingest.sh
│       ├── run-ingest.sh
│       ├── wait-for.ts
│       └── enable-pgvector.ts
├── prisma/
│   ├── schema.prisma             # Data model
│   └── migrations/               # SQL migrations
├── data/raw/                     # Downloaded CSVs (gitignored)
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── EVAL.md                       # Manual chat eval scenarios
├── .env.example
└── .env.docker.example
```

### Module boundaries

| Layer | Responsibility |
|-------|----------------|
| **routes/** | HTTP parsing, Zod validation, status codes — no business logic |
| **services/** | Domain logic, Prisma queries, cache read/write |
| **agents/** | AI orchestration only; reuses services for data access |
| **ws/** | WebSocket protocol, event routing |
| **lib/** | Shared infrastructure (DB, cache, OpenAI, envelopes) |
| **scripts/** | Offline jobs (ingest, Docker bootstrap) — not loaded by the API at runtime |

### Entry points

- **Runtime:** `src/server.ts` → `createApp()` + WebSocket attach
- **Ingest:** `scripts/ingest/index.ts`
- **Docker:** `scripts/docker/entrypoint.sh` → `wait-for` → `node dist/src/server.js`

---

## 7. Core Features

### Search (`GET /search`)

Structured search with availability filtering via `calendar_days`, nightly price aggregation, facets (price range, property types, amenities), map pins, pagination, and sort options (`price_asc`, `price_desc`, `rating`, `popularity`, `distance`).

### AI concierge (WebSocket)

Natural-language trip planning for Lisbon and Barcelona. The concierge collects mandatory slots (`city`, `checkIn`, `checkOut`, `adults`), asks clarifying questions when needed, then triggers retrieval with per-listing AI rationales.

### Top picks (`GET /top-picks`)

Curated homepage cards — top rated, guest favorites, and great value — with optional city filter.

### Listings

- **Detail** — full listing card with host, amenities, review summary, aspect scores
- **Calendar** — per-day availability and price
- **Price quote** — stay total from nightly rates
- **Reviews** — paginated reviews with optional topic filter

### Wishlist

Token-scoped saved listings persisted in PostgreSQL with Redis cache invalidation on write.

### Compare (`POST /compare`)

Side-by-side comparison of 2–5 listings with an AI-generated verdict (when OpenAI is configured).

### Batch summaries (`POST /batch/summaries`)

Fetch up to 20 listing summaries in one request (cached per listing).

### Mock reservations (`POST /reservations/mock`)

Returns a mock confirmation for demo/prototype booking flows — not a real payment or host integration.

### Agent traces (`GET /agents/traces/:requestId`)

Debug endpoint exposing step-by-step agent execution (concierge, retrieval, review), token usage, and latency.

---

## 8. Application Flow

### Authentication

FlatGigs uses **anonymous session tokens** — not user accounts.

1. The client generates a **UUID v4** and sends it on every API call as `X-Token: <uuid>`.
2. WebSocket connections pass the same token as `?token=<uuid>` or `X-Token` header.
3. `tokenMiddleware` rejects missing or invalid UUIDs with `401`.
4. `GET /health` is public (no token).

There is no JWT, OAuth, or server-side token issuance in this backend.

### Request lifecycle (REST)

```
Client
  → CORS check
  → express.json()
  → requestIdMiddleware (X-Request-Id or generated UUID)
  → apiResponseMiddleware (res.success / res.fail)
  → tokenMiddleware (UUID validation)
  → Route handler (Zod validation)
  → Service (Prisma + Redis cache-aside)
  → JSON envelope { data, success, meta }
  → errorHandler on thrown errors
```

### API flow (search example)

```
GET /api/v1/search?city=lisbon&checkIn=...&checkOut=...&adults=2
  → search.route.ts validates query
  → search.service.ts
      → cache lookup (search:base:v2:<hash>)
      → city lookup
      → candidate listings + availability filter
      → calendar nightly pricing
      → sort, facets, map pins
      → cache store
      → paginate
  → res.success(result, { page, limit, total })
```

### WebSocket chat flow

```
Connect ws://host/ws?token=<uuid>
  ← connected
  ← assistant.history (if session exists in Redis)

Client → { "event": "chat.start", "data": { "query": "..." } }
  → conversation.service → agents/graph.ts
  → concierge (OpenAI slot extraction)
  ← state.updated, assistant.status, assistant.message
  → if readyToSearch: retrieval (DB search + AI rationales)
  ← assistant.results, assistant.status (idle)

Client → { "event": "chat.message", "data": { "message": "..." } }
  → follow-up: review agent OR another concierge turn

Client → { "event": "chat.cancel" }
  → cancels in-flight turn
```

### Background jobs

There are no in-process schedulers or queue workers. The **ingest pipeline** is an offline batch job run manually or via `yarn docker:ingest`. On completion it flushes Redis data caches (`search`, `listing`, `cities`, `compare`, `rationale`, `wishlist`, `top-picks`, `batch:summary`).

---

## 9. API Overview

**Base URL:** `http://localhost:4000/api/v1`  
**Auth header:** `X-Token: <uuid-v4>` (required on all `/api/v1/*` routes)  
**Health (public):** `GET /health`

### Response envelope

All REST responses use a consistent shape:

```json
{
  "data": { ... },
  "success": true,
  "meta": {
    "code": 200,
    "message": "OK"
  }
}
```

Errors:

```json
{
  "data": null,
  "success": false,
  "meta": {
    "code": 400,
    "message": "Invalid search query",
    "errors": { ... }
  }
}
```

WebSocket messages wrap the same envelope:

```json
{ "event": "assistant.results", "envelope": { "data": { ... }, "success": true, "meta": { ... } } }
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check (no auth) |
| `GET` | `/cities` | Supported cities |
| `GET` | `/top-picks` | Curated listings (`?city=`, `?limit=`) |
| `GET` | `/search` | Structured search (see below) |
| `GET` | `/listings/:id` | Listing detail |
| `GET` | `/listings/:id/calendar` | Availability calendar (`?from=`, `?to=`) |
| `GET` | `/listings/:id/price-quote` | Stay pricing (`?checkIn=`, `?checkOut=`) |
| `GET` | `/listings/:id/reviews` | Paginated reviews (`?page=`, `?limit=`, `?topic=`) |
| `GET` | `/chat` | REST view of chat session (mirrors WS history) |
| `POST` | `/wishlist` | Add listing `{ "listingId": "..." }` |
| `GET` | `/wishlist` | List saved listings |
| `DELETE` | `/wishlist/:listingId` | Remove saved listing |
| `POST` | `/compare` | Compare listings `{ "listingIds": [], "checkIn?", "checkOut?" }` |
| `POST` | `/batch/summaries` | Batch summaries `{ "listingIds": [] }` (max 20) |
| `POST` | `/reservations/mock` | Mock booking confirmation |
| `GET` | `/agents/traces/:requestId` | Agent debug trace |

### Search query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `city` | yes | City slug (`lisbon`, `barcelona`) or city ID |
| `checkIn` | yes | ISO date `YYYY-MM-DD` |
| `checkOut` | yes | ISO date `YYYY-MM-DD` |
| `adults` | no | Default inferred by AI chat; REST accepts explicit value |
| `children` | no | Default `0` |
| `rooms` | no | Default `1` |
| `priceMin`, `priceMax` | no | Nightly price bounds |
| `ratingMin` | no | Minimum rating (0–5) |
| `propertyTypes` | no | Comma-separated or repeated |
| `amenities` | no | Must have all listed amenities |
| `sort` | no | `price_asc`, `price_desc`, `rating`, `popularity`, `distance` |
| `lat`, `lng` | no | Reference point for distance sort |
| `bounds` | no | Map bounds `neLat,neLng,swLat,swLng` |
| `page`, `limit` | no | Pagination (max `limit` 50) |
| `includeMapPins` | no | `true`/`false` (default `true`) |

**Example:**

```bash
curl -H "X-Token: 550e8400-e29b-41d4-a716-446655440000" \
  "http://localhost:4000/api/v1/search?city=lisbon&checkIn=2026-06-10&checkOut=2026-06-15&adults=2&sort=rating&limit=10"
```

**Response `data` shape:**

```json
{
  "items": [
    {
      "id": "...",
      "name": "...",
      "photos": ["..."],
      "propertyType": "apartment",
      "roomType": "entire_home",
      "pricePerNight": 85,
      "totalForStay": 425,
      "rating": 4.92,
      "reviewCount": 128,
      "amenities": ["wifi", "kitchen"],
      "latitude": 38.72,
      "longitude": -9.14,
      "distanceKm": 1.2
    }
  ],
  "total": 342,
  "facets": {
    "priceRange": { "min": 35, "max": 420 },
    "propertyTypes": { "apartment": 210 },
    "amenities": { "wifi": 300 }
  },
  "mapPins": [
    { "id": "...", "lat": 38.72, "lng": -9.14, "pricePerNight": 85, "ratingAvg": 4.92 }
  ]
}
```

### WebSocket events

| Client → Server | Description |
|-----------------|-------------|
| `ping` | Heartbeat |
| `chat.start` | Start conversation `{ "query": "..." }` |
| `chat.message` | Follow-up message `{ "message": "..." }` |
| `chat.cancel` | Cancel in-flight turn |

| Server → Client | Description |
|-----------------|-------------|
| `connected` | Connection acknowledged |
| `pong` | Heartbeat response |
| `assistant.history` | Session replay on reconnect |
| `assistant.status` | Agent progress (thinking, searching, typing) |
| `state.updated` | Parsed filters, chips, phase |
| `assistant.message` | Concierge text reply |
| `assistant.results` | Search results with rationales |
| `citation` | Review excerpts |
| `step_started` / `step_completed` | Agent step timing |
| `done` | Turn complete (review flow) |
| `error` | Error envelope |

### Error handling

- Route handlers call `res.fail(code, message, meta?)` for expected errors.
- Uncaught exceptions reach `errorHandler` middleware and return `{ success: false, meta: { code, message } }`.
- WebSocket errors emit an `error` event with the same envelope shape.
- OpenAI missing → `503` on AI endpoints with `retryable: false`.

---

## 10. Development Guidelines

### Coding standards

- **TypeScript strict mode** — no implicit any; prefer explicit types on public APIs.
- **Zod at boundaries** — validate env (`config.ts`), HTTP query/body, and agent LLM JSON output.
- **Thin routes, fat services** — routes parse and respond; services own queries and caching.
- **No console.log** — use `process.stdout.write` / `process.stderr.write` in scripts.
- **Consistent envelopes** — always use `res.success` / `res.fail` or `ok()` / `fail()` helpers.

### Naming conventions

| Area | Convention |
|------|------------|
| Files | `kebab-case` for multi-word routes; `*.service.ts`, `*.route.ts` |
| Functions | `camelCase` |
| DB columns | `snake_case` (Prisma `@map`) |
| Cache keys | Prefix + version + hash, e.g. `search:base:v2:<hash>` |
| Env vars | `SCREAMING_SNAKE_CASE` |

### Architecture principles

1. **Cache-aside, not write-through** — services check Redis, fall back to Postgres, then populate cache.
2. **Agent graph is orchestration** — agents call services; they do not query Prisma directly except via tools.
3. **Token-scoped user state** — wishlists and chat sessions are keyed by client UUID, not user accounts.
4. **Ingest is idempotent per city** — reload deletes existing city listings before re-import.
5. **Config centralization** — defaults and ingest settings live in `src/config.ts`.

### Branching strategy

No branching policy is enforced in-repo. Recommended for teams:

- `main` — production-ready
- `feature/<name>` — feature branches
- PRs with review before merge to `main`

---

## 11. Deployment

### Docker Compose (recommended)

Production-style stack: `app`, `postgres` (pgvector), `redis`.

```bash
cp .env.docker.example .env
# Set OPENAI_API_KEY
docker compose up -d --build
curl http://localhost:4000/health
./scripts/docker/run-ingest.sh   # First-time data load
```

### Deploy updates (preserve DB)

After pushing code changes:

```bash
git pull
docker compose build app
docker compose up -d app
```

If new Prisma migrations exist:

```bash
docker compose exec app npx prisma migrate deploy
```

Do **not** run `docker compose down -v` unless you intend to wipe the database.

### Environment-specific configuration

| Environment | Notes |
|-------------|-------|
| **Local** | Postgres on host port 5433; set `PORT=4000` to match Docker |
| **Docker** | Internal service DNS (`postgres`, `redis`); `NODE_ENV=production` |
| **Production** | Set `CORS_ORIGIN` to your frontend domain(s); tune cache TTLs |

### CI/CD

There is **no GitHub Actions or CI pipeline** in this repository today. Recommended additions:

- Lint + typecheck on PR
- `yarn build` verification
- `prisma migrate deploy` in deploy step
- Health check after deploy

### Infrastructure requirements

| Resource | Minimum |
|----------|---------|
| **App container** | 512 MB RAM; 1 vCPU |
| **Postgres** | 2+ GB RAM for full Lisbon + Barcelona dataset |
| **Redis** | 256 MB+ depending on cache volume |
| **Disk** | ~5 GB for raw CSVs + DB |
| **Network** | Outbound HTTPS for OpenAI and Inside Airbnb downloads |

---

## 12. Troubleshooting

### Common issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 Token required` | Missing or invalid `X-Token` | Send a valid UUID v4 header |
| `404 City not found` | Data not ingested or wrong city slug | Run ingest; use `lisbon` or `barcelona` |
| `503 OPENAI_API_KEY required` | Key missing or empty | Set `OPENAI_API_KEY` in `.env` |
| Search returns 0 results | Dates outside calendar data or no availability | Try different dates; verify ingest completed |
| `ECONNREFUSED` on startup | Postgres/Redis not running | `docker compose up -d postgres redis` |
| Port conflict on 5432 | Local Postgres already running | Use port **5433** (Docker default mapping) |
| App listens on 3000 | `PORT` not set | Set `PORT=4000` in `.env` |
| Chat session lost | Redis TTL expired (default 20 min) | Reconnect; history replayed if within TTL |
| Ingest fails mid-run | Network timeout downloading CSVs | Re-run with `FORCE_DOWNLOAD=1` if corrupted |

### Setup problems

**Prisma client out of date:**

```bash
yarn prisma:generate
```

**Migrations not applied:**

```bash
yarn prisma:migrate        # local dev
yarn prisma:deploy         # production
```

**Stale cache after ingest:**

Ingest automatically calls `flushDataCaches()`. To manually flush, restart Redis or delete keys matching patterns in [`src/lib/cache.ts`](src/lib/cache.ts).

### Debugging tips

1. **Agent traces** — copy `meta.requestId` from `assistant.results` and call `GET /api/v1/agents/traces/:requestId`.
2. **App logs** — `docker compose logs -f app`
3. **Manual chat eval** — follow scenarios in [`EVAL.md`](EVAL.md)
4. **Request correlation** — pass `X-Request-Id` header on REST calls
5. **Health check** — `curl http://localhost:4000/health` should return `{ "status": "ok" }`

### Docker cleanup

```bash
# Stop services, remove local images
docker compose down --rmi local

# Full reset (wipes DB + cached downloads)
docker compose down -v --rmi local && docker builder prune -f
```

---

## 13. Future Improvements

### Known limitations

- **Two cities only** — Lisbon and Barcelona; hardcoded in `config.ingest.cities`.
- **No real bookings** — reservations endpoint is mock-only.
- **No user accounts** — anonymous UUID tokens only; no cross-device sync beyond token persistence.
- **Embeddings not used in search** — vectors are generated at ingest but retrieval is filter/rating-based today; pgvector is enabled for future semantic search.
- **Itinerary swap** — WebSocket event `itinerary.swap` returns `501 Not Implemented`.
- **No automated tests** — quality relies on manual eval ([`EVAL.md`](EVAL.md)).
- **No CI/CD** — deploy is manual via Docker Compose.
- **SEARCH.md removed** — search documentation is consolidated in this README.

### Planned enhancements

- Semantic / vector search using stored embeddings and pgvector indexes
- Additional cities and configurable city registry
- Real reservation and payment integration
- User authentication and persistent profiles
- Automated test suite and CI pipeline
- Rate limiting and API key management for production
- OpenAPI / Swagger documentation at `/api/docs` (middleware hook exists but routes are not yet implemented)
- Background job queue for long-running ingest and embedding refresh

---

## Quick reference

| | |
|--|--|
| REST base | `http://localhost:4000/api/v1` |
| Health | `GET /health` |
| WebSocket | `ws://localhost:4000/ws?token=<uuid-v4>` |
| Auth | `X-Token: <uuid-v4>` |
| Node | 20 |
| Postgres (host) | `localhost:5433` |
| Redis (host) | `localhost:6379` |

For manual AI chat validation, see [`EVAL.md`](EVAL.md).  
For cache defaults and ingest configuration, see [`src/config.ts`](src/config.ts).
