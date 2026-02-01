import { Module } from "@nestjs/common";

import { GachaModule } from "../gacha/gacha.module";
import { InventoryModule } from "../inventory/inventory.module";
import { QueueModule } from "../queue/queue.module";
import { UserSyncModule } from "../user-sync/user-sync.module";
import { TestCommandController } from "./__tests__/test-command.controller";
import { CommandModule } from "./commands/command.module";
import { GachaCommands } from "./commands/gacha.commands";
import { InventoryCommands } from "./commands/inventory.commands";
import { CommandDispatcherMiddleware } from "./commands/middleware/command-dispatcher.middleware";
import { SignatureGuard } from "./guards/signature.guard";
import { LineController } from "./line.controller";
import { LineService } from "./line.service";
import { EnsureWalletMiddleware } from "./middleware/ensure-wallet.middleware";
import { LoggingMiddleware } from "./middleware/logging.middleware";
import { MiddlewareRunner } from "./middleware/middleware.runner";
import { LINE_MIDDLEWARES } from "./middleware/middleware.types";
import { PermissionMiddleware } from "./middleware/permission.middleware";
import { RateLimitMiddleware } from "./middleware/rate-limit.middleware";
import { UserTrackMiddleware } from "./middleware/user-track.middleware";
import { IdempotencyService } from "./services/idempotency.service";

/**
 * LINE Bot Module
 *
 * Provides LINE webhook handling, signature verification,
 * and middleware-based event processing.
 *
 * Features:
 * - Webhook endpoint for receiving LINE events
 * - HMAC-SHA256 signature verification
 * - Onion-model middleware architecture
 * - Decorator-based command routing
 * - Structured logging (without message content)
 *
 * Middleware chain:
 * 1. RateLimitMiddleware - Prevents spam
 * 2. LoggingMiddleware - Logs event metadata
 * 3. UserTrackMiddleware - Tracks user activity and syncs profiles
 * 4. EnsureWalletMiddleware - Ensures user wallet exists
 * 5. PermissionMiddleware - Injects user permissions
 * 6. CommandDispatcherMiddleware - Routes events to command handlers
 *
 * To add custom commands:
 * 1. Create a controller with @Controller()
 * 2. Use @Command(), @OnEvent(), or @Postback() decorators on methods
 * 3. The module will automatically discover and register handlers
 */
@Module({
  imports: [
    UserSyncModule,
    QueueModule,
    CommandModule,
    GachaModule,
    InventoryModule,
  ],
  controllers: [
    LineController,
    TestCommandController,
    GachaCommands,
    InventoryCommands,
  ],
  providers: [
    LineService,
    IdempotencyService,
    SignatureGuard,
    LoggingMiddleware,
    RateLimitMiddleware,
    UserTrackMiddleware,
    EnsureWalletMiddleware,
    PermissionMiddleware,
    {
      provide: LINE_MIDDLEWARES,
      useFactory: (
        rateLimitMiddleware: RateLimitMiddleware,
        loggingMiddleware: LoggingMiddleware,
        userTrackMiddleware: UserTrackMiddleware,
        ensureWalletMiddleware: EnsureWalletMiddleware,
        permissionMiddleware: PermissionMiddleware,
        commandDispatcherMiddleware: CommandDispatcherMiddleware
      ) => [
        rateLimitMiddleware,
        loggingMiddleware,
        userTrackMiddleware,
        ensureWalletMiddleware,
        permissionMiddleware,
        commandDispatcherMiddleware,
      ],
      inject: [
        RateLimitMiddleware,
        LoggingMiddleware,
        UserTrackMiddleware,
        EnsureWalletMiddleware,
        PermissionMiddleware,
        CommandDispatcherMiddleware,
      ],
    },
    MiddlewareRunner,
  ],
  exports: [LineService, MiddlewareRunner],
})
export class LineModule {}
