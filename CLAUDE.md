# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Princess Connect Re:Dive LINE chatbot — a production LINE messaging bot built on the [Bottender](https://bottender.js.org/) framework with a React admin frontend. The bot provides game features (gacha simulation, character lookup, guild battle coordination), group management (leveling, custom commands, rankings), and AI-powered conversation via Google Gemini.

## Architecture

Three services run in Docker Compose:

- **app/** — Main bot + Express API server (port 5000). Entry: `app/server.js` → `app/src/app.js`
- **frontend/** — React 17 admin dashboard (port 3000). Entry: `frontend/src/App.js`
- **job/** — Cron-based background tasks. Entry: `job/index.js`

Supporting infrastructure: MySQL (database `Princess`), Redis (session/cache), nginx (reverse proxy), ngrok (dev tunneling).

### Backend (app/) Request Flow

`app/src/app.js` defines the Bottender middleware chain for LINE webhook messages:

1. `setProfile` → `statistics` → `recordLatestGroupUser` → `lineEvent` (LINE events like join/leave)
2. `config` → `transfer` (Discord webhook) → `HandlePostback` (postback routing)
3. `rateLimit` → `alias` (command aliasing)
4. `GlobalOrderBase` → `OrderBased` (feature routing) → `CustomerOrderBased` (user-defined commands)
5. `interactWithBot` (Gemini AI fallback) → `recordSession` → `Nothing`

Express API routes are at `/api/*` (defined in `app/src/router/api.js`), with token-based auth middleware in `app/src/middleware/validation.js`.

### Backend Layers

- **Controllers** (`app/src/controller/`) — Route handlers split into `princess/` (game features) and `application/` (group/system features)
- **Models** (`app/src/model/`) — Extend `app/src/model/base.js`, a Knex-based CRUD base class with `table`, `fillable`, transaction support, and methods: `all()`, `first()`, `find()`, `create()`, `update()`, `delete()`
- **Services** (`app/src/service/`) — Business logic layer
- **Templates** (`app/src/templates/`) — LINE Flex Message builders
- **Middleware** (`app/src/middleware/`) — Bottender chain middleware + Express middleware
- **Router** (`app/src/router/`) — Express API route definitions

### Data Layer

- MySQL via Knex query builder (`app/knexfile.js`). Database: `Princess`
- Redis for Bottender session storage and caching (`app/src/util/redis.js`)
- SQLite for game asset data (`app/assets/`)
- Migrations in `app/migrations/` (Knex)

### Frontend (frontend/)

React 17 with Material-UI v4/v5, react-router-dom v5, axios for API calls, Socket.IO for real-time updates.

## Common Commands

### Docker (primary workflow)

```bash
make build-images      # Build Docker images
make build-project     # Install dependencies in all services
make build             # Full setup: pull + build + install
make run               # Start all containers (docker compose up -d)
make logs              # Tail all container logs
make bash              # Shell into bot container
make bash-redis        # Open Redis CLI
```

### Backend (app/)

```bash
yarn dev               # Dev server with nodemon hot-reload
yarn start             # Production server
yarn test              # Jest tests
yarn lint              # ESLint
yarn migrate           # Run Knex migrations
yarn debug             # Verbose Bottender debug logging
```

### Frontend (frontend/)

```bash
yarn start             # React dev server (port 3000)
yarn build             # Production build
yarn test              # React Testing Library tests
```

### Job (job/)

```bash
yarn dev               # Dev with nodemon
yarn start             # Production cron runner
```

## Code Style

- ESLint + Prettier: double quotes, trailing commas (es5), 100 char print width
- CommonJS modules (`require`/`module.exports`) throughout backend
- Config in `app/.eslintrc.js` and `app/.prettierrc`

## Environment

Copy `.env.example` to `.env`. Required variables: `LINE_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `DB_PASSWORD`, `DB_USER`, `DB_USER_PASSWORD`, `REDIS_PASSWORD`, `ADMIN_EMAIL`. See `.env.example` for optional variables and infrastructure defaults.

## LINE Webhook

Webhook URL: `https://{domain}/webhooks/line` — configured in `app/bottender.config.js`. Only the LINE channel is enabled.

## Key Config Files

- `app/bottender.config.js` — Bottender session (Redis), LINE channel config, initial state
- `app/knexfile.js` — MySQL connection config
- `app/config/default.json` — Game logic settings, API endpoints, color codes
- `docker-compose.yml` — Service definitions (infra only; bot/frontend/crontab defined in override files)
