import { Injectable, Logger } from "@nestjs/common";
import {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";

/**
 * Rate Limit Middleware
 *
 * Basic traffic control to prevent abuse.
 * In a production environment, this should ideally be handled by
 * infrastructure (Nginx, API Gateway) or Redis-based rate limiting.
 *
 * This implementation uses a simple in-memory counter per user/source.
 * Note: In-memory state does not persist across restarts or scale across instances.
 */
@Injectable()
export class RateLimitMiddleware implements LineMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  
  // Map of SourceID -> { count, timestamp }
  private readonly requests = new Map<string, { count: number; timestamp: number }>();
  
  private readonly WINDOW_MS = 60 * 1000; // 1 minute window
  private readonly MAX_REQUESTS = 60; // Max 60 requests per minute

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const sourceId = this.getSourceId(ctx.event);
    
    // Skip rate limiting if source is unknown or system event
    if (sourceId === "unknown") {
      return next();
    }

    const now = Date.now();
    const record = this.requests.get(sourceId) || { count: 0, timestamp: now };

    // Reset window if expired
    if (now - record.timestamp > this.WINDOW_MS) {
      record.count = 0;
      record.timestamp = now;
    }

    // Increment count
    record.count++;
    this.requests.set(sourceId, record);

    // Check limit
    if (record.count > this.MAX_REQUESTS) {
      this.logger.warn(`Rate limit exceeded for source: ${sourceId}`);
      // Don't call next(), effectively dropping the request
      // Ideally we might want to reply with "Too many requests", 
      // but that might cause more traffic loop.
      return;
    }

    await next();
  }

  private getSourceId(event: any): string {
    if (event.source && event.source.userId) return `user:${event.source.userId}`;
    if (event.source && event.source.groupId) return `group:${event.source.groupId}`;
    if (event.source && event.source.roomId) return `room:${event.source.roomId}`;
    return "unknown";
  }
}
