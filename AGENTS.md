# AGENTS.md - Developer Guide for AI Coding Agents

This document provides essential information for AI coding agents working on the Redive LineBot project. This is a LINE Bot project built with NestJS (backend) and React (frontend) in a pnpm monorepo, currently undergoing refactoring.

**⚠️ CONSTITUTIONAL MANDATE**: All code changes MUST comply with `.specify/memory/constitution.md` principles:
1. **Testability-First Design** (NON-NEGOTIABLE): All business logic decoupled from external dependencies
2. **Library Reuse Priority**: Search existing code/libraries before implementing
3. **Clean Code Compliance**: Functions ≤30 lines, single responsibility, clear naming
4. **No Over-Engineering** (NON-NEGOTIABLE): YAGNI principle, readable over clever
5. **Database-Free Integration Testing**: Use mocks/SQLite, never production databases

## Project Overview

- **Tech Stack**: NestJS + Fastify, Prisma ORM, @line/bot-sdk (Backend) | React + Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query (Frontend)
- **Database**: PostgreSQL 16, Redis 7
- **Package Manager**: pnpm 9.x (required)
- **Node Version**: 24 LTS
- **Monorepo Structure**: pnpm workspaces with `apps/backend` and `apps/frontend`

---

## Build, Test, and Development Commands

### Global Commands (from root)

```bash
# Development
pnpm dev                 # Start backend + frontend (also starts Docker services)
pnpm build              # Build all packages
pnpm typecheck          # Run TypeScript checks across all packages
pnpm lint               # Run ESLint across all packages
pnpm test               # Run tests across all packages

# Docker Services
pnpm docker:up          # Start PostgreSQL + Redis containers
pnpm docker:down        # Stop Docker services
pnpm docker:logs        # View Docker logs

# Database (Prisma)
pnpm db:generate        # Generate Prisma Client
pnpm db:push            # Sync schema to database (dev)
pnpm db:migrate         # Run migrations
pnpm db:studio          # Open Prisma Studio

# Cleanup
pnpm clean              # Remove node_modules, dist, .turbo from all packages
```

### Backend Commands (`@repo/backend`)

```bash
# Development
pnpm --filter @repo/backend dev          # Start with watch mode
pnpm --filter @repo/backend build        # Build with NestJS CLI
pnpm --filter @repo/backend start        # Start without watch
pnpm --filter @repo/backend start:debug  # Start with debugger

# Testing (Vitest)
pnpm --filter @repo/backend test                    # Run tests
pnpm --filter @repo/backend test:watch              # Watch mode
pnpm --filter @repo/backend test:cov                # With coverage

# Run a single test file
pnpm --filter @repo/backend exec vitest apps/backend/test/line/idempotency.service.spec.ts

# Run tests matching a pattern
pnpm --filter @repo/backend exec vitest -t "should be defined"

# Type checking and linting
pnpm --filter @repo/backend typecheck    # TypeScript type checking
pnpm --filter @repo/backend lint         # ESLint with auto-fix
```

### Frontend Commands (`@repo/frontend`)

```bash
pnpm --filter @repo/frontend dev         # Start Vite dev server (port 5173)
pnpm --filter @repo/frontend build       # Build for production
pnpm --filter @repo/frontend preview     # Preview production build
pnpm --filter @repo/frontend typecheck   # TypeScript type checking
pnpm --filter @repo/frontend lint        # ESLint
```

---

## Code Style Guidelines

### Import Conventions

1. **Use ES6 modules** exclusively (not CommonJS)
2. **Import order**:
   - External dependencies (NestJS, LINE SDK, etc.)
   - Internal modules (relative imports)
   - Type-only imports using `import type` for better compilation
3. **Path aliases**: Backend uses `@/*` for `./src/*` (configured in tsconfig.json)

**Example:**
```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { messagingApi } from "@line/bot-sdk";

import { PrismaService } from "../prisma/prisma.service";
import type { WebhookEvent } from "./types/events";
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Files** | kebab-case with type suffix | `line.service.ts`, `health.controller.ts`, `middleware.types.ts` |
| **Classes** | PascalCase | `LineService`, `PrismaModule`, `HealthController` |
| **Interfaces/Types** | PascalCase | `WebhookEvent`, `HealthResponse`, `MiddlewareContext` |
| **Functions/Methods** | camelCase | `extractSourceId()`, `handle()`, `replyMessage()` |
| **Variables** | camelCase | `eventId`, `startTime`, `mockRedisClient` |
| **Constants** | UPPER_SNAKE_CASE | `LINE_MIDDLEWARES`, `REDIS_TTL` |

### TypeScript Standards

- **Strict mode enabled**: All TypeScript strict checks are on
- **Explicit return types**: Always specify return types for public methods
- **Type-safe patterns**: Use interfaces/types for all data structures
- **Avoid `any`**: Use `unknown` or proper types instead
- **Null handling**: Use `null` for API responses that can fail (e.g., `Promise<T | null>`)
- **Type imports**: Use `import type` for type-only imports

**Example:**
```typescript
async replyMessage(
  replyToken: string,
  messages: messagingApi.Message[]
): Promise<messagingApi.ReplyMessageResponse | null> {
  try {
    // implementation
  } catch (error) {
    return null;
  }
}
```

### NestJS Patterns

1. **Decorators**: Use `@Injectable()` for services, `@Controller()` for controllers, `@Module()` for modules
2. **Dependency Injection**: Use constructor-based injection with `private readonly`
3. **Lifecycle Hooks**: Implement `OnModuleInit`, `OnModuleDestroy` for resource management
4. **Logger**: Use NestJS Logger (not console.log)
   ```typescript
   private readonly logger = new Logger(ClassName.name);
   ```
5. **Global Modules**: Use `@Global()` decorator for shared modules (Redis, Prisma)

### Error Handling

1. **Try-catch blocks**: Wrap async operations that can fail
2. **Error logging**: Log errors with context using NestJS Logger
3. **Error messages**: Extract message safely:
   ```typescript
   error instanceof Error ? error.message : String(error)
   ```
4. **Re-throw when needed**: In middleware, log then re-throw to propagate errors
5. **Return null pattern**: For API clients, return `null` on error instead of throwing

**Example:**
```typescript
try {
  const response = await this.client.replyMessage({ replyToken, messages });
  this.logger.debug(`Reply message sent successfully`);
  return response;
} catch (error) {
  this.logger.error(
    `Failed to send reply message: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  return null;
}
```

### Documentation

- **JSDoc comments**: Add for all public classes, methods, and complex logic
- **Description format**:
  ```typescript
  /**
   * Class/method description
   *
   * Additional context or important notes.
   *
   * @param paramName - Description
   * @returns Description
   */
  ```
- **Inline comments**: Use sparingly for complex logic only

---

## Project Structure

```
redive_linebot/
├── apps/
│   ├── backend/                 # NestJS backend application
│   │   ├── src/
│   │   │   ├── config/         # Configuration module (env handling)
│   │   │   ├── health/         # Health check endpoint
│   │   │   ├── line/           # LINE Bot logic
│   │   │   │   ├── guards/     # NestJS guards (signature validation)
│   │   │   │   ├── middleware/ # Event processing middleware (onion model)
│   │   │   │   ├── services/   # LINE-related services
│   │   │   │   └── types/      # Type definitions
│   │   │   ├── prisma/         # Prisma module
│   │   │   ├── redis/          # Redis module
│   │   │   └── main.ts         # Application entry point
│   │   ├── test/               # Test files (mirrors src structure)
│   │   ├── prisma/             # Prisma schema
│   │   └── vitest.config.ts
│   └── frontend/                # React frontend application
│       └── src/
│           ├── components/     # React components
│           ├── stores/         # Zustand state stores
│           └── lib/            # Utilities (e.g., cn for Tailwind)
├── docker/                      # Docker Compose configuration
├── packages/                    # Shared packages (reserved for future)
└── specs/                       # Feature specification documents
```

---

## Testing Guidelines

### Test-First Development (MANDATORY)

- **New features**: Write tests BEFORE implementation
- **Bug fixes**: Write failing test reproducing the bug BEFORE fixing
- **All tests**: MUST run locally without Docker/external services

### Testing Framework & Structure

- **Framework**: Vitest (Backend only; Frontend tests not yet configured)
- **Test file location**: `apps/backend/test/` (mirrors `src/` structure)
- **Test file naming**: `{name}.spec.ts`
- **Mocking**: Use `vi.fn()` for Vitest mocks
- **Setup**: Import `reflect-metadata` at the top of test files
- **NestJS Testing**: Use `@nestjs/testing` with `Test.createTestingModule()`

### Testability Requirements (CONSTITUTIONAL)

All business logic MUST:
- Be decoupled from external dependencies (database, Redis, LINE SDK)
- Use dependency injection for all external services
- Be mockable via constructor injection
- Run in isolation without real connections

**Example: Service with proper dependency injection**
```typescript
import "reflect-metadata";
import { Test, TestingModule } from "@nestjs/testing";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

describe("ServiceName", () => {
  let service: ServiceName;
  let mockDependency: any;

  beforeEach(async () => {
    // Mock all external dependencies
    mockDependency = {
      method: vi.fn().mockResolvedValue("mocked result"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceName,
        {
          provide: DependencyService,
          useValue: mockDependency,
        },
      ],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should handle business logic without external calls", async () => {
    const result = await service.doSomething();
    expect(mockDependency.method).toHaveBeenCalled();
    expect(result).toBe("expected result");
  });
});
```

### Test Pyramid Strategy

1. **Unit Tests** (Most): Business logic with mocked dependencies
2. **Integration Tests** (Moderate): Module interaction, SQLite/memory DB only
3. **E2E Tests** (Minimal): Critical flows only

---

## Environment Variables

Required environment variables (see `.env.example`):

```bash
# Backend
BACKEND_PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
REDIS_URL=redis://localhost:6379

# LINE Bot
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret
```

---

## Development Workflow

1. **Start Docker services first**: `pnpm docker:up`
2. **Generate Prisma client**: `pnpm db:generate` (first time or after schema changes)
3. **Push database schema**: `pnpm db:push` (dev) or `pnpm db:migrate` (production)
4. **Start development**: `pnpm dev` (starts both backend and frontend)
5. **Check health**: Visit `http://localhost:3000/health`

---

## Common Patterns

### Middleware Pattern (LINE Event Processing)

The backend uses an "onion model" for processing LINE webhook events. Middleware are executed in order, each calling `next()` to continue.

```typescript
@Injectable()
export class CustomMiddleware implements LineMiddleware {
  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    // Pre-processing
    await next(); // Continue to next middleware
    // Post-processing
  }
}
```

### Configuration Access

```typescript
constructor(private readonly configService: ConfigService) {}

const value = this.configService.get<string>("path.to.config");
```

### Prisma Usage

```typescript
constructor(private readonly prisma: PrismaService) {}

await this.prisma.user.findUnique({ where: { id } });
```

### Redis Usage

```typescript
constructor(private readonly redis: RedisService) {}

const client = this.redis.getClient();
await client.set("key", "value", "EX", 3600);
```

---

## Important Notes

- **Always run type checking** before committing: `pnpm typecheck`
- **Docker must be running** for local development (PostgreSQL + Redis)
- **No CI tests yet**: The GitHub Actions workflow focuses on deployment only
- **Frontend testing**: Not configured yet; consider adding Vitest or Playwright
- **Refactoring in progress**: Some patterns may be inconsistent; follow the newest code in `apps/backend/src/line/`

---

**Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Maintainer**: Redive LineBot Team
