# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Princess Connect Re:Dive LINE chatbot — a production LINE messaging bot built on the [Bottender](https://bottender.js.org/) framework with a React admin frontend. Provides game features (gacha simulation, character lookup, guild battle coordination, raid boss, janken arena, trade market), group management (levels, rankings, custom commands), and AI conversation via Google Gemini.

## Repository Layout

Yarn workspaces root: `app/` (all backend code) and `frontend/` (admin dashboard, embedded as LINE LIFF). Design specs live in `docs/`.

- There is no `job/` package — cron is `yarn worker` inside `app/` (see below).
- The legacy `migration/Princess.sql` docker init was folded into knex (`app/migrations/20210101000000_baseline_initial_schema.{js,sql}`); knex is now the single schema source.

## Runtime Architecture

### Local development (the normal workflow)

- `make infra` runs **only** MySQL + Redis + phpMyAdmin in Docker (`docker-compose.yml`).
- `app/` and `frontend/` run on the host via `yarn dev`, **not** in containers.
- The bot listens on `PORT=9527` (fallback default in `app/server.js`); frontend on `3000`.
- Vite proxies `/api`, `/webhooks`, `/socket.io` from `3000` → `9527` (`frontend/vite.config.js`), so the frontend talks to the bot directly without nginx.
- For LINE webhook + LIFF testing, use Cloudflare quick tunnel: `make cf-go` (= `cf-up` + `cf-tunnel`) launches `cloudflared --url http://localhost:3000`, then syncs the trycloudflare URL into LINE's webhook, LIFF endpoint, and `.env`'s `APP_DOMAIN` in one shot. Restart the bot afterwards so Flex image URLs pick up the new `APP_DOMAIN`.
- Root `.env` is the single env file — loaded by `app/server.js`, `app/tasks.js`, and `app/knexfile.js` via `dotenv` pointing at `../.env`.

### Production

- Since 2026-07-29: single AWS EC2 `t4g.medium` (Graviton/arm64, Ubuntu 24.04, `ap-east-2`), one docker compose stack in `~/stack` on the host — **not** in this repo, and **not** Portainer-managed (Portainer is not deployed on this machine).
- Reverse proxy is **Caddy** (not Traefik) fronting `pudding.hanshino.dev`.
- Three services: **bot** (`yarn start`), **frontend** (pre-built static), **worker** (`yarn worker`).
- CI (`.github/workflows/main.yml`) only builds `linux/arm64` images and pushes to `ghcr.io/hanshino/redive_backend` / `ghcr.io/hanshino/redive_frontend` (tags `latest` and the commit SHA); `docker/setup-qemu-action` and any amd64 build were removed since the only deploy target is arm64.
- **Deployment is automatic, but pull-based rather than a CI step.** The host runs a systemd timer `stack-deploy.timer` (`OnUnitActiveSec=5min`) that fires `stack-deploy.service`: `docker compose pull --quiet` → `docker compose up -d --remove-orphans` → `docker image prune -f`, with `WorkingDirectory=/home/ubuntu/stack`. So merging to `main` reaches production within ~5 minutes of the image landing on GHCR, with no manual step and no CD job in the workflow. Both unit files live on the host in `/etc/systemd/system/`, not in this repo. To check a deploy: `ssh haws 'journalctl -u stack-deploy.service -n 50'`, or compare the running image against the registry with `docker compose ps -q <svc>` + `docker inspect -f '{{.Image}}'`.
- `docker-compose.traefik.yml` in this repo is stale (Traefik + Portainer-era, `hanshino/redive_backend` on Docker Hub) and not used by the running stack, but it's kept as the canonical source for the four path prefixes Caddy routes to the bot — `/api`, `/webhooks`, `/bot-assets`, `/socket.io` — do not delete without carrying that list somewhere else first.

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

`app/src/` splits into `controller/`, `service/`, `model/`, `templates/` (LINE Flex builders), `middleware/`, `router/`. Inside `controller/`, `model/`, and `templates/` the same two-way split repeats: `princess/` = game features, `application/` = group/system features.

- **Models** all extend `app/src/model/base.js` — supply `{ table, fillable }`, get `all()` / `first()` / `find()` / `create()` / `update()` / `delete()` plus `transaction()` / `setTransaction(trx)` for trx propagation.
- **Middleware** holds both Bottender-chain middleware and the Express `/api` token auth (`validation.js`).

### Data layer

- **MySQL** via Knex (`app/knexfile.js`) — database is hardcoded `Princess`. Host-run migrations read the root `.env` (`DB_HOST=mysql` maps to the docker-exposed port 3306 on localhost).
- **Redis** — Bottender session store + general cache (`app/src/util/redis.js`). Session TTL 60 min, state TTL 15 min (`app/bottender.config.js`).
- **SQLite** — read-only game data (`app/assets/redive_tw.db`) and a local task log (`app/assets/task.db`); accessed via `better-sqlite3` through `app/src/model/princess/character/index.js`, with `app/src/util/sqlite.js` as the connection factory.
- **Migrations** — `app/migrations/`. Create new ones with `cd app && yarn knex migrate:make <name>` — never hand-write. knex is the single schema source (the old docker `Princess.sql` init was folded into the `20210101000000_baseline_initial_schema` migration). **Fresh DB bootstrap**: `cd app && yarn migrate && yarn knex seed:run` (migrate builds all tables, seeders fill `chat_exp_unit` / `GachaPool` / etc.) — there is no more SQL injected at container first-boot. **Do not specify a collation when creating the database** (or specify `utf8mb4_0900_ai_ci` explicitly) — MySQL 8's default must match what `20260327_unify_all_collation_to_0900.js` assumes, or later migrations fail with `Illegal mix of collations`; see the comment in `20210101000000_baseline_initial_schema.js` for the full story.

### Socket.IO

`app/src/util/connection.js` constructs the shared Express `server`, wraps it in `http`, and attaches `io` to the same port. Frontend connects through the Vite proxy in dev, through Traefik in prod.

## Frontend (frontend/) Internals

- Bundler: **Vite 8** (not CRA). No test runner is configured — Jest tests exist only in `app/` (`__tests__/` dirs alongside services/controllers/bin).
- Entry: `frontend/src/main.jsx` → `App.jsx`; pages under `src/pages/`.
- Auth uses LINE LIFF (`@line/liff`) — pages assume a LIFF context, and LIFF endpoint URLs are kept in sync by `make cf-tunnel` in dev.
- Progressive redesign toward MUI card layouts is in progress; see memory for which pages are done.

## Common Commands

`yarn dev` at the root runs app + frontend concurrently; each workspace's own scripts are in its `package.json`, and `make help` lists every Makefile target. The non-obvious ones:

```bash
make infra                                    # MySQL + Redis + phpMyAdmin only — bot/frontend run on the host
make cf-go                                    # tunnel + sync URL into LINE webhook, LIFF, .env APP_DOMAIN
cd app && yarn worker                         # cron scheduler (tasks.js + app/bin/*) — no HTTP server
cd app && yarn test -- path/to/file.test.js   # single test file
cd app && yarn knex migrate:make <name>       # never hand-write a migration
cd app && yarn migrate && yarn knex seed:run  # fresh-DB bootstrap
cd app && yarn debug                          # DEBUG=bottender:action node server.js
```

## LINE Webhook Flow

LINE channel is the only enabled webhook (`app/bottender.config.js`): `POST /webhooks/line`. Messenger / WhatsApp / Telegram / Slack / Viber blocks exist but are disabled. To rotate the public URL during development, run `make cf-go` (or just `make cf-tunnel` if cloudflared is already up) and restart the bot.

## Code Style

- ESLint 10 + Prettier 3: double quotes, trailing commas (`es5`), 100-char print width (`app/.eslintrc.js`, `app/.prettierrc`). Husky + lint-staged format on commit via `app/node_modules/.bin/prettier` (monorepo-wide).
- CommonJS throughout the backend (`require` / `module.exports`). Frontend is ESM (`"type": "module"`).

## Environment

Copy `.env.example` to root `.env`. Required: `LINE_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `DB_PASSWORD`, `DB_USER`, `DB_USER_PASSWORD`, `REDIS_PASSWORD`. Optional but commonly used: `LINE_LIFF_ID` + variants, `LINE_LOGIN_CHANNEL_ID/SECRET` (for `make cf-tunnel`'s LIFF update), `GEMINI_API_KEY`, `PICTSHARE_URL` + `PICTSHARE_UPLOAD_CODE`, `UMAMI_URL` + `UMAMI_WEBSITE_ID`. `APP_DOMAIN` is rewritten in-place by `make cf-tunnel` so Flex image URLs always point at the active tunnel host.

## Key Config Files

- `app/config/default.json` — game logic constants, external link URLs, color palette; read via `require("config").get(...)`.
- `app/config/crontab.config.js` — cron schedule → `app/bin/<Script>.js` mapping (edit here when adding background jobs).
- `docker-compose.yml` — infra only. No longer mounts any SQL init; schema is bootstrapped purely by knex.
- `docker-compose.traefik.yml` — production service + Traefik routing labels. Not used locally.
