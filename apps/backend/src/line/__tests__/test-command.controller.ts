import { Controller, Injectable, Logger } from "@nestjs/common";

import { Command } from "../commands/decorators/command.decorator";
import { OnEvent } from "../commands/decorators/on-event.decorator";
import { Postback } from "../commands/decorators/postback.decorator";
import type { CommandContext } from "../commands/interfaces/command-handler.interface";

@Injectable()
@Controller()
export class TestCommandController {
  private readonly logger = new Logger(TestCommandController.name);

  @Command("hello")
  async handleHello(context: {
    commandContext: CommandContext;
  }): Promise<void> {
    const { rawText, args } = context.commandContext;
    this.logger.log(`Hello command received: "${rawText}" with args:`, args);
  }

  @Command({ command: "ping", aliases: ["p"] })
  async handlePing(): Promise<void> {
    this.logger.log("Ping command received");
  }

  @Command(/^roll\s+(\d+)d(\d+)$/i)
  async handleDiceRoll(context: {
    commandContext: CommandContext;
  }): Promise<void> {
    const { match } = context.commandContext;
    if (match) {
      const [, count, sides] = match;
      this.logger.log(`Rolling ${count}d${sides}`);
    }
  }

  @OnEvent("follow")
  async handleFollow(): Promise<void> {
    this.logger.log("User followed the bot");
  }

  @OnEvent("join")
  async handleJoin(): Promise<void> {
    this.logger.log("Bot joined a group");
  }

  @Postback("buy_item")
  async handleBuyItem(context: {
    commandContext: CommandContext;
  }): Promise<void> {
    const { rawText } = context.commandContext;
    this.logger.log(`Buy item postback: ${rawText}`);
  }
}
