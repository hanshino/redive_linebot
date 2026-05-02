# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Princess Connect Re:Dive LINE chatbot — a production LINE messaging bot built on the [Bottender](https://bottender.js.org/) framework with a React admin frontend. Provides game features (gacha simulation, character lookup, guild battle coordination, raid boss, janken arena, trade market), group management (levels, rankings, custom commands), and AI conversation via Google Gemini.

## Repository Layout

Yarn workspaces root; two packages plus shared dev tooling:

- **app/** — Bottender bot + Express API + Socket.IO + cron worker. All backend code lives here.
- **frontend/** — React 19 + MUI 7 + Vite admin dashboard, embedded as LINE LIFF.
- **migration/** — MySQL init scripts (mounted into the mysql container on first boot).
- **docs/** — Design specs (e.g. `docs/superpowers/specs/`).

There is no `job/` package — cron is `yarn worker` inside `app/` (see below).

## Runtime Architecture

### Local development (the normal workflow)

- `make infra` runs **only** MySQL + Redis + phpMyAdmin in Docker (`docker-compose.yml`).
- `app/` and `frontend/` run on the host via `yarn dev`, **not** in containers.
- The bot listens on `PORT=9527` (fallback default in `app/server.js`); frontend on `3000`.
- Vite proxies `/api`, `/webhooks`, `/socket.io` from `3000` → `9527` (`frontend/vite.config.js`), so the frontend talks to the bot directly without nginx.
- For LINE webhook + LIFF testing, use Cloudflare quick tunnel: `make cf-go` (= `cf-up` + `cf-tunnel`) launches `cloudflared --url http://localhost:3000`, then syncs the trycloudflare URL into LINE's webhook, LIFF endpoint, and `.env`'s `APP_DOMAIN` in one shot. Restart the bot afterwards so Flex image URLs pick up the new `APP_DOMAIN`.
- Root `.env` is the single env file — loaded by `app/server.js`, `app/tasks.js`, and `app/knexfile.js` via `dotenv` pointing at `../.env`.

### Production

- Defined in `docker-compose.traefik.yml` (referenced but deployed via Portainer stacks — see memory).
- Three services: **bot** (`yarn start`), **frontend** (pre-built static), **worker** (`yarn worker`).
- Traefik terminates TLS and routes `/api`, `/webhooks`, `/bot-assets`, `/socket.io` → bot; everything else → frontend.

### Bot process vs worker process

Both run from `app/`, sharing the same codebase and `.env`:

- **bot** (`yarn dev` / `yarn start` → `server.js`): Bottender + Express + Socket.IO on port 9527. Handles LINE webhooks, REST API under `/api`, static assets at `/bot-assets`.
- **worker** (`yarn worker` → `tasks.js`): cron scheduler that reads `app/config/crontab.config.js` and executes scripts in `app/bin/` (auto-gacha, chat-exp aggregation, daily cleanup, achievement evaluation, race lifecycle, etc.). Never starts the HTTP server.

## Backend (app/) Internals

### Bottender middleware chain (`app/src/app.js#App`)

Order matters — this is the actual chain:

1. `setProfile` → `statistics` → `recordLatestGroupUser` → `lineEvent`
2. `config` (loads per-group `guildConfig` into `context.state`) → `transfer` (Discord mirror) → `HandlePostback`
3. `rateLimit` → `alias` → `umamiTrack`
4. `GlobalOrderBase` → `OrderBased` (main command router) → `CustomerOrderBased` (user-defined commands)
5. `interactWithBot` (mention-triggered Gemini fallback) → `OpenaiController.recordSession` → `Nothing`

Command routing in `OrderBased` composes routers from every domain controller (gacha, battle, worldboss, janken, achievement, market, coupon, race, subscribe, character, job, etc.) plus top-level `text(...)` matchers. Adding a new command almost always means appending to `OrderBased` or exposing a `.router` array from a controller.

### Layers

- **Controllers** (`app/src/controller/`): split into `princess/` (game features: gacha, battle, character, god-stone shop) and `application/` (group/system: chat level, worldboss, janken, achievements, market, race, subscribe, admin, customer orders).
- **Services** (`app/src/service/`): business logic reused across controllers (`AchievementEngine`, `GachaService`, `EquipmentService`, `JankenService`, `RaceService`, `SubscriptionService`, `WorldBossEvent*Service`, `EventCenterService`, etc.).
- **Models** (`app/src/model/`): Knex-based CRUD, split into `application/` and `princess/`. All extend `app/src/model/base.js` — supply `{ table, fillable }`; get `all()`, `first()`, `find()`, `create()`, `update()`, `delete()`, plus `transaction()` / `setTransaction(trx)` for trx propagation.
- **Templates** (`app/src/templates/`): LINE Flex Message builders, mirroring the controller split.
- **Middleware** (`app/src/middleware/`): Bottender-chain middleware (`profile`, `statistics`, `config`, `alias`, `rateLimit`, `dcWebhook`, `umamiTrack`) and Express auth (`validation.js` for `/api` tokens).
- **Router** (`app/src/router/api.js`): Express REST API; `socket.js` wires Socket.IO events on the shared HTTP server.

### Data layer

- **MySQL** via Knex (`app/knexfile.js`) — database is hardcoded `Princess`. Host-run migrations read the root `.env` (`DB_HOST=mysql` maps to the docker-exposed port 3306 on localhost).
- **Redis** — Bottender session store + general cache (`app/src/util/redis.js`). Session TTL 60 min, state TTL 15 min (`app/bottender.config.js`).
- **SQLite** — read-only game data (`app/assets/redive_tw.db`) and a local task log (`app/assets/task.db`); accessed via `better-sqlite3` through `app/src/model/princess/GameSqlite.js`.
- **Migrations** — `app/migrations/`. Create new ones with `cd app && yarn knex migrate:make <name>` — never hand-write.

### Socket.IO

`app/src/util/connection.js` constructs the shared Express `server`, wraps it in `http`, and attaches `io` to the same port. Frontend connects through the Vite proxy in dev, through Traefik in prod.

## Frontend (frontend/) Internals

- React 19, MUI 7 (`@mui/material`, `@mui/x-data-grid` v8), Emotion, `react-router-dom` v7, Framer Motion, Recharts, Socket.IO client.
- Bundler: **Vite 8** (not CRA). Dev: `yarn dev`. Build: `yarn build`. No test runner currently configured.
- Entry: `frontend/src/main.jsx` → `App.jsx`. Pages under `src/pages/` (Achievement, Admin, Auto{History,Settings}, Bag, CustomerOrder, Equipment, Gacha, Group, Home, Janken, Panel, Race, Rankings, Tools, Trade).
- Auth uses LINE LIFF (`@line/liff`) — pages assume a LIFF context, and LIFF endpoint URLs are kept in sync by `make cf-tunnel` in dev.
- Progressive redesign toward MUI card layouts is in progress; see memory for which pages are done.

## Common Commands

Root (yarn workspaces glue):

```bash
yarn dev              # runs app + frontend concurrently
yarn test:app         # jest in app/
yarn lint:app         # eslint in app/
yarn lint:frontend    # eslint in frontend/
yarn build:frontend   # production build
yarn migrate          # proxies to app/yarn migrate
```

Makefile (infra + LINE plumbing):

```bash
make infra            # docker compose up -d mysql redis (+ phpmyadmin)
make infra-stop       # docker compose down
make migrate          # cd app && yarn migrate
make logs             # tail infra logs
make bash-redis       # redis-cli into the redis container
make cf-up            # start cloudflared quick tunnel (background, log → /tmp/cloudflared.log)
make cf-down          # stop cloudflared
make cf-url           # print current trycloudflare URL
make cf-tunnel        # push cloudflared URL → LINE webhook + LIFF endpoint + .env APP_DOMAIN
make cf-go            # cf-up + cf-tunnel one-shot
make get-webhook      # print current LINE webhook endpoint
make get-liff         # print LIFF app config
make help             # list all targets
```

app/ scripts:

```bash
yarn dev              # nodemon server.js (port 9527)
yarn start            # production bot
yarn worker           # cron scheduler (tasks.js + app/bin/*)
yarn test             # jest
yarn test -- path/to/file.test.js   # single test file
yarn lint             # eslint .
yarn migrate          # knex migrate:latest
yarn debug            # DEBUG=bottender:action node server.js
```

frontend/ scripts:

```bash
yarn dev              # vite dev server (port 3000)
yarn build            # production build
yarn preview          # serve the built dist
yarn lint             # eslint .
```

Tests currently live only in `app/` (Jest, `__tests__/` dirs alongside services/controllers/bin). There is no frontend test runner.

## LINE Webhook Flow

LINE channel is the only enabled webhook (`app/bottender.config.js`): `POST /webhooks/line`. Messenger / WhatsApp / Telegram / Slack / Viber blocks exist but are disabled. To rotate the public URL during development, run `make cf-go` (or just `make cf-tunnel` if cloudflared is already up) and restart the bot.

## Code Style

- ESLint 10 + Prettier 3: double quotes, trailing commas (`es5`), 100-char print width (`app/.eslintrc.js`, `app/.prettierrc`). Husky + lint-staged format on commit via `app/node_modules/.bin/prettier` (monorepo-wide).
- CommonJS throughout the backend (`require` / `module.exports`). Frontend is ESM (`"type": "module"`).

## Environment

Copy `.env.example` to root `.env`. Required: `LINE_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `DB_PASSWORD`, `DB_USER`, `DB_USER_PASSWORD`, `REDIS_PASSWORD`. Optional but commonly used: `LINE_LIFF_ID` + variants, `LINE_LOGIN_CHANNEL_ID/SECRET` (for `make cf-tunnel`'s LIFF update), `GEMINI_API_KEY`, `PICTSHARE_URL` + `PICTSHARE_UPLOAD_CODE`, `UMAMI_URL` + `UMAMI_WEBSITE_ID`. `APP_DOMAIN` is rewritten in-place by `make cf-tunnel` so Flex image URLs always point at the active tunnel host.

## Key Config Files

- `app/bottender.config.js` — session store (Redis), channel enablement, initial `context.state`.
- `app/knexfile.js` — single MySQL connection config for app + worker + migrations.
- `app/config/default.json` — game logic constants, external link URLs, color palette; read via `config` package (`require("config").get(...)`).
- `app/config/crontab.config.js` — cron schedule → `app/bin/<Script>.js` mapping (edit here when adding background jobs).
- `docker-compose.yml` — infra only (mysql, redis, phpmyadmin). Dev reality; bot/frontend run on the host.
- `docker-compose.traefik.yml` — production service + Traefik routing labels. Not used locally.
