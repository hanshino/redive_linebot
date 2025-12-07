import { Injectable, Logger } from "@nestjs/common";
import {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";

/**
 * Logging Middleware
 *
 * Provides structured logging for LINE event processing.
 * Logs event metadata (ID, type, source) without including message content
 * to comply with privacy requirements.
 *
 * Log format:
 * - Start: Event ID, type, source type, source ID
 * - End: Event ID, processing duration, success/failure status
 */
@Injectable()
export class LoggingMiddleware implements LineMiddleware {
  private readonly logger = new Logger("LineEvent");

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    const event = ctx.event;

    // Extract event metadata (without message content)
    const eventId =
      "webhookEventId" in event ? event.webhookEventId : "unknown";
    const eventType = event.type;
    const sourceType = "source" in event ? event.source?.type : "unknown";
    const sourceId = this.extractSourceId(event);
    const isRedelivery =
      "deliveryContext" in event
        ? event.deliveryContext?.isRedelivery
        : undefined;

    // Log event start
    this.logger.log({
      message: "Processing LINE event",
      eventId,
      eventType,
      sourceType,
      sourceId,
      destination: ctx.destination,
      isRedelivery,
    });

    try {
      // Continue to next middleware
      await next();

      // Log successful completion
      const duration = Date.now() - startTime;
      this.logger.log({
        message: "LINE event processed successfully",
        eventId,
        eventType,
        durationMs: duration,
        status: "success",
      });
    } catch (error) {
      // Log failure
      const duration = Date.now() - startTime;
      this.logger.error({
        message: "LINE event processing failed",
        eventId,
        eventType,
        durationMs: duration,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw to propagate the error
      throw error;
    }
  }

  /**
   * Extract the source ID based on source type
   * Uses type-safe access with checks
   */
  private extractSourceId(event: MiddlewareContext["event"]): string {
    if (!("source" in event) || !event.source) {
      return "unknown";
    }

    const source = event.source;

    switch (source.type) {
      case "user":
        return source.userId || "unknown";
      case "group":
        return source.groupId || "unknown";
      case "room":
        return source.roomId || "unknown";
      default:
        return "unknown";
    }
  }
}
