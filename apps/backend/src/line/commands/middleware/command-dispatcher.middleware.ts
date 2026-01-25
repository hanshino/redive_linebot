import { Injectable, Logger } from "@nestjs/common";

import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "../../middleware/middleware.types";
import type {
  MessageEvent,
  PostbackEvent,
  WebhookEvent,
} from "../../types/events";
import type { CommandContext } from "../interfaces/command-handler.interface";
import { CommandDiscoveryService } from "../services/command-discovery.service";

@Injectable()
export class CommandDispatcherMiddleware implements LineMiddleware {
  private readonly logger = new Logger(CommandDispatcherMiddleware.name);
  private readonly systemPrefixes = ["#", "/", ".", "!"];

  constructor(private readonly commandDiscovery: CommandDiscoveryService) {}

  async handle(ctx: MiddlewareContext, _next: NextFunction): Promise<void> {
    const { event } = ctx;

    if (event.type === "message" && event.message.type === "text") {
      await this.handleTextMessage(event, ctx);
      return;
    }

    if (event.type === "postback") {
      await this.handlePostback(event, ctx);
      return;
    }

    await this.handleGenericEvent(event, ctx);
  }

  private async handleTextMessage(
    event: MessageEvent,
    ctx: MiddlewareContext
  ): Promise<void> {
    if (event.message.type !== "text") return;

    const originalText = event.message.text;
    const { content } = this.removePrefix(originalText);

    let handler = this.commandDiscovery.findCommandHandler(content);
    let commandContext: CommandContext | null = null;

    if (!handler) {
      const regexResult =
        this.commandDiscovery.findRegexCommandHandler(originalText);
      if (regexResult) {
        handler = regexResult.handler;
        commandContext = {
          event,
          rawText: originalText,
          args: this.parseArgs(originalText),
          match: regexResult.match,
        };
      }
    } else {
      commandContext = {
        event,
        rawText: content,
        args: this.parseArgs(content),
      };
    }

    if (handler && commandContext) {
      await this.executeHandler(handler, commandContext, ctx);
    } else {
      this.logger.debug(`No handler found for text: "${originalText}"`);
    }
  }

  private async handlePostback(
    event: PostbackEvent,
    ctx: MiddlewareContext
  ): Promise<void> {
    const action = this.extractPostbackAction(event.postback.data);
    if (!action) {
      this.logger.warn(`Invalid postback data: ${event.postback.data}`);
      return;
    }

    const handler = this.commandDiscovery.findPostbackHandler(action);
    if (handler) {
      const commandContext: CommandContext = {
        event,
        rawText: event.postback.data,
      };
      await this.executeHandler(handler, commandContext, ctx);
    } else {
      this.logger.debug(`No handler found for postback action: "${action}"`);
    }
  }

  private async handleGenericEvent(
    event: WebhookEvent,
    ctx: MiddlewareContext
  ): Promise<void> {
    const handlers = this.commandDiscovery.findEventHandlers(event.type);
    if (handlers.length === 0) {
      this.logger.debug(`No handler found for event type: ${event.type}`);
      return;
    }

    for (const handler of handlers) {
      const commandContext: CommandContext = { event };
      await this.executeHandler(handler, commandContext, ctx);
    }
  }

  private async executeHandler(
    handler: any,
    commandContext: CommandContext,
    _ctx: MiddlewareContext
  ): Promise<void> {
    try {
      this.logger.debug(
        `Executing handler: ${handler.controllerName}.${handler.methodName}`
      );

      const request = {
        event: commandContext.event,
        commandContext,
      };

      await handler.method.call(handler.instance, request);
    } catch (error) {
      this.logger.error(
        `Handler execution failed: ${handler.controllerName}.${handler.methodName}`,
        error instanceof Error ? error.stack : String(error)
      );
      throw error;
    }
  }

  private removePrefix(text: string): { content: string; hasPrefix: boolean } {
    for (const prefix of this.systemPrefixes) {
      if (text.startsWith(prefix)) {
        return {
          content: text.slice(prefix.length).trim(),
          hasPrefix: true,
        };
      }
    }
    return { content: text, hasPrefix: false };
  }

  private parseArgs(text: string): string[] {
    return text.trim().split(/\s+/).filter(Boolean);
  }

  private extractPostbackAction(data: string): string | null {
    try {
      const parsed = JSON.parse(data);
      return parsed.action || null;
    } catch {
      const match = data.match(/action=([^&]+)/);
      return match ? match[1] : null;
    }
  }
}
