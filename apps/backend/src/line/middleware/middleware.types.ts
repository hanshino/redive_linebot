/**
 * Middleware Types for LINE Event Processing
 *
 * Implements an onion-model middleware architecture similar to Koa.js/Bottender.
 * Each middleware can process events before and after the next middleware.
 */
import { Logger } from "@nestjs/common";
import type { Role } from "@prisma/client";
import type { WebhookEvent } from "../types/events";

/**
 * Permission information for the current user and context
 */
export interface PermissionInfo {
  userId: string;
  groupId?: string;
  role: Role;
}

/**
 * Middleware execution context
 *
 * Contains all information needed by middleware to process a LINE event.
 * The `state` map can be used to share data between middlewares.
 */
export interface MiddlewareContext {
  /**
   * The LINE webhook event being processed
   */
  event: WebhookEvent;

  /**
   * Bot's user ID that received the event
   */
  destination: string;

  /**
   * Reply token for sending response messages (if available)
   * Note: Only certain event types have a reply token
   */
  replyToken: string | null;

  /**
   * Shared state map for passing data between middlewares
   * Use this to share computed values or flags between middleware functions
   */
  state: Map<string, unknown>;

  /**
   * Logger instance for structured logging
   */
  logger: Logger;

  /**
   * Permission information for the current user (injected by PermissionMiddleware)
   */
  permission?: PermissionInfo;
}

/**
 * Next function to call the next middleware in the chain
 *
 * In the onion model, code before `await next()` runs during the request phase,
 * and code after `await next()` runs during the response phase.
 */
export type NextFunction = () => Promise<void>;

/**
 * Middleware function signature
 *
 * Example usage:
 * ```typescript
 * const loggingMiddleware: Middleware = async (ctx, next) => {
 *   console.log(`[START] Processing event: ${ctx.event.type}`);
 *   await next(); // Pass control to the next middleware
 *   console.log(`[END] Finished processing event: ${ctx.event.type}`);
 * };
 * ```
 */
export type Middleware = (
  context: MiddlewareContext,
  next: NextFunction
) => Promise<void>;

/**
 * Interface for class-based middleware implementations
 *
 * Allows middlewares to use dependency injection in NestJS.
 *
 * Example:
 * ```typescript
 * @Injectable()
 * class MyMiddleware implements LineMiddleware {
 *   constructor(private readonly someService: SomeService) {}
 *
 *   async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
 *     // Use someService
 *     await next();
 *   }
 * }
 * ```
 */
export interface LineMiddleware {
  handle(context: MiddlewareContext, next: NextFunction): Promise<void>;
}

/**
 * Event processing result for tracking and logging
 */
export interface EventProcessingResult {
  /**
   * The webhook event ID
   */
  eventId: string;

  /**
   * Whether processing was successful
   */
  success: boolean;

  /**
   * Error information if processing failed
   */
  error: Error | null;

  /**
   * Processing time in milliseconds
   */
  processingTimeMs: number;
}

/**
 * Injection token for middleware collection
 */
export const LINE_MIDDLEWARES = Symbol("LINE_MIDDLEWARES");
