import { Injectable, Logger } from "@nestjs/common";
import {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";
import { LineService } from "../line.service";
import { webhook } from "@line/bot-sdk";

/**
 * Echo Middleware
 *
 * Example middleware that replies with the same text message received.
 * Demonstrates how to handle specific event types and use LineService.
 */
@Injectable()
export class EchoMiddleware implements LineMiddleware {
  private readonly logger = new Logger(EchoMiddleware.name);

  constructor(private readonly lineService: LineService) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const event = ctx.event;

    // Only process text messages
    if (event.type === "message" && "message" in event && event.message.type === "text") {
      const messageEvent = event as webhook.MessageEvent;
      const text = (messageEvent.message as webhook.TextMessageContent).text;
      const replyToken = ctx.replyToken;

      this.logger.log(`Echoing message: ${text}`);

      if (replyToken) {
        await this.lineService.replyText(replyToken, text);
      }
    }

    // Continue to next middleware
    await next();
  }
}
