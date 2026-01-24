import { Module } from "@nestjs/common";
import { QueueModule } from "../queue/queue.module";
import { UserSyncModule } from "../user-sync/user-sync.module";
import { SignatureGuard } from "./guards/signature.guard";
import { LineController } from "./line.controller";
import { LineService } from "./line.service";
import { EchoMiddleware } from "./middleware/echo.middleware";
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
 * - Structured logging (without message content)
 *
 * Middleware chain:
 * 1. RateLimitMiddleware - Prevents spam
 * 2. LoggingMiddleware - Logs event metadata
 * 3. UserTrackMiddleware - Tracks user activity and syncs profiles
 * 4. PermissionMiddleware - Injects user permissions
 * 5. EchoMiddleware - Replies with the same text message
 *
 * To add custom middleware:
 * 1. Create a class implementing LineMiddleware
 * 2. Add it to the LINE_MIDDLEWARES provider array
 */
@Module({
  imports: [UserSyncModule, QueueModule],
  controllers: [LineController],
  providers: [
    LineService,
    IdempotencyService,
    SignatureGuard,
    LoggingMiddleware,
    RateLimitMiddleware,
    UserTrackMiddleware,
    PermissionMiddleware,
    EchoMiddleware,
    {
      provide: LINE_MIDDLEWARES,
      useFactory: (
        rateLimitMiddleware: RateLimitMiddleware,
        loggingMiddleware: LoggingMiddleware,
        userTrackMiddleware: UserTrackMiddleware,
        permissionMiddleware: PermissionMiddleware,
        echoMiddleware: EchoMiddleware
      ) => [
        rateLimitMiddleware,
        loggingMiddleware,
        userTrackMiddleware,
        permissionMiddleware,
        echoMiddleware,
      ],
      inject: [
        RateLimitMiddleware,
        LoggingMiddleware,
        UserTrackMiddleware,
        PermissionMiddleware,
        EchoMiddleware,
      ],
    },
    MiddlewareRunner,
  ],
  exports: [LineService, MiddlewareRunner],
})
export class LineModule {}
