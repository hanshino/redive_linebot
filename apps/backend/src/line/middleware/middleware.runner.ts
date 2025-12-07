import { Injectable, Logger, Inject, Optional } from "@nestjs/common";
import {
  Middleware,
  MiddlewareContext,
  LineMiddleware,
  LINE_MIDDLEWARES,
  EventProcessingResult,
} from "./middleware.types";
import type { WebhookEvent } from "../types/events";

/**
 * Middleware Runner
 *
 * Executes a chain of middleware functions using the onion model.
 * Each middleware can process events before and after calling next().
 *
 * Execution flow:
 * ```
 * Request → Middleware A (before) → Middleware B (before) → Middleware C (before)
 *                                                                    ↓
 * Response ← Middleware A (after) ← Middleware B (after) ← Middleware C (after)
 * ```
 */
@Injectable()
export class MiddlewareRunner {
  private readonly logger = new Logger(MiddlewareRunner.name);
  private readonly middlewares: Middleware[] = [];

  constructor(
    @Optional()
    @Inject(LINE_MIDDLEWARES)
    injectedMiddlewares?: LineMiddleware[]
  ) {
    // Convert class-based middlewares to function middlewares
    if (injectedMiddlewares) {
      for (const mw of injectedMiddlewares) {
        this.middlewares.push((ctx, next) => mw.handle(ctx, next));
      }
    }
  }

  /**
   * Add a middleware function to the chain
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Add a class-based middleware to the chain
   */
  useClass(middleware: LineMiddleware): this {
    this.middlewares.push((ctx, next) => middleware.handle(ctx, next));
    return this;
  }

  /**
   * Execute all middlewares for a single event
   */
  async run(
    event: WebhookEvent,
    destination: string
  ): Promise<EventProcessingResult> {
    const startTime = Date.now();
    const eventId =
      "webhookEventId" in event ? (event.webhookEventId as string) : "unknown";

    const context: MiddlewareContext = {
      event,
      destination,
      replyToken: "replyToken" in event ? (event.replyToken as string) : null,
      state: new Map(),
      logger: this.logger,
    };

    try {
      await this.compose(this.middlewares)(context);

      return {
        eventId,
        success: true,
        error: null,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(
        `Error processing event ${eventId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        error instanceof Error ? error.stack : undefined
      );

      return {
        eventId,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Compose middlewares into a single function using the onion model
   *
   * This implementation is inspired by koa-compose and ensures that:
   * 1. Middlewares are executed in order
   * 2. Each middleware can await next() to pass control
   * 3. Code after next() executes in reverse order (onion model)
   */
  private compose(
    middlewares: Middleware[]
  ): (context: MiddlewareContext) => Promise<void> {
    return (context: MiddlewareContext): Promise<void> => {
      let index = -1;

      const dispatch = async (i: number): Promise<void> => {
        // Prevent calling next() multiple times
        if (i <= index) {
          throw new Error("next() called multiple times");
        }
        index = i;

        const middleware = middlewares[i];

        // End of chain
        if (!middleware) {
          return;
        }

        // Execute middleware with next function pointing to next middleware
        await middleware(context, () => dispatch(i + 1));
      };

      return dispatch(0);
    };
  }

  /**
   * Get the count of registered middlewares
   */
  get middlewareCount(): number {
    return this.middlewares.length;
  }
}
