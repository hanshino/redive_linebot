import { Module } from "@nestjs/common";
import { LineController } from "./line.controller";
import { LineService } from "./line.service";
import { MiddlewareRunner } from "./middleware/middleware.runner";
import { LoggingMiddleware } from "./middleware/logging.middleware";
import { RateLimitMiddleware } from "./middleware/rate-limit.middleware";
import { EchoMiddleware } from "./middleware/echo.middleware";
import { SignatureGuard } from "./guards/signature.guard";
import { LINE_MIDDLEWARES } from "./middleware/middleware.types";
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
 * Default middleware chain:
 * 1. RateLimitMiddleware - Prevents spam
 * 2. LoggingMiddleware - Logs event metadata
 * 3. EchoMiddleware - Replies with the same text message
 *
 * To add custom middleware:
 * 1. Create a class implementing LineMiddleware
 * 2. Add it to the LINE_MIDDLEWARES provider array
 */
@Module({
  imports: [],
  controllers: [LineController],
  providers: [
    LineService,
    IdempotencyService,
    SignatureGuard,
    LoggingMiddleware,
    RateLimitMiddleware,
    EchoMiddleware,
    {
      provide: LINE_MIDDLEWARES,
      useFactory: (
        rateLimitMiddleware: RateLimitMiddleware,
        loggingMiddleware: LoggingMiddleware,
        echoMiddleware: EchoMiddleware
      ) => [rateLimitMiddleware, loggingMiddleware, echoMiddleware],
      inject: [RateLimitMiddleware, LoggingMiddleware, EchoMiddleware],
    },
    MiddlewareRunner,
  ],
  exports: [LineService, MiddlewareRunner],
})
export class LineModule {}
