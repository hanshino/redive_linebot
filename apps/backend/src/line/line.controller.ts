import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { SignatureGuard } from "./guards/signature.guard";
import { MiddlewareRunner } from "./middleware/middleware.runner";
import type { WebhookRequestBody } from "./types/events";

/**
 * LINE Webhook Controller
 *
 * Handles incoming webhook requests from the LINE Platform.
 * All requests are validated using the SignatureGuard before processing.
 *
 * Endpoint: POST /line/webhook
 */
@Controller("line")
export class LineController {
  private readonly logger = new Logger(LineController.name);

  constructor(private readonly middlewareRunner: MiddlewareRunner) {}

  /**
   * Handle LINE webhook events
   *
   * This endpoint receives webhook events from the LINE Platform.
   * Events are processed through the middleware chain.
   *
   * Note: Always returns 200 OK to acknowledge receipt, even if
   * processing fails. This prevents LINE from retrying immediately.
   */
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SignatureGuard)
  async handleWebhook(@Body() body: WebhookRequestBody): Promise<"OK"> {
    const { destination, events } = body;

    if (!events || events.length === 0) {
      this.logger.debug("Received webhook with no events (verification ping)");
      return "OK";
    }

    this.logger.log(`Received ${events.length} event(s) from LINE`);

    // Process each event through the middleware chain
    // Use Promise.allSettled to ensure all events are processed
    // even if some fail
    const results = await Promise.allSettled(
      events.map((event) => this.middlewareRunner.run(event, destination))
    );

    // Log summary of results
    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;
    const failCount = results.length - successCount;

    if (failCount > 0) {
      this.logger.warn(
        `Batch processing completed: ${successCount} succeeded, ${failCount} failed`
      );
    } else {
      this.logger.log(`All ${successCount} event(s) processed successfully`);
    }

    // Always return OK to LINE Platform
    // Failed events will be logged but not retried by LINE
    return "OK";
  }
}
