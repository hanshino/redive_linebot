# redive_linebot Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-07

## Active Technologies
- TypeScript 5.7+ / Node.js 22+ + NestJS 11, @line/bot-sdk 9.7, ioredis 5.4, Fastify (002-line-event-handler)
- Redis（冪等性檢查，帶 TTL）、PostgreSQL（未來擴展用，此功能不使用） (002-line-event-handler)

- TypeScript 5.x, Node.js 24 LTS (001-env-setup)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x, Node.js 24 LTS: Follow standard conventions

## Recent Changes
- 002-line-event-handler: Added TypeScript 5.7+ / Node.js 22+ + NestJS 11, @line/bot-sdk 9.7, ioredis 5.4, Fastify

- 001-env-setup: Added TypeScript 5.x, Node.js 24 LTS

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
