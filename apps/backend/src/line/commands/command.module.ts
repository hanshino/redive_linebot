import { Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { CommandDispatcherMiddleware } from "./middleware/command-dispatcher.middleware";
import { CommandDiscoveryService } from "./services/command-discovery.service";

/**
 * Command Module
 *
 * Provides decorator-based command routing for LINE Bot webhook events.
 * Automatically discovers controllers with @Command(), @OnEvent(), and @Postback() decorators.
 *
 * @example
 * ```typescript
 * @Controller()
 * export class MyController {
 *   @Command('hello')
 *   async handleHello(@Context() ctx: CommandContext) {
 *     // Handle "hello" command
 *   }
 *
 *   @OnEvent('follow')
 *   async handleFollow(@Context() ctx: CommandContext) {
 *     // Handle follow event
 *   }
 * }
 * ```
 */
@Module({
  imports: [DiscoveryModule],
  providers: [CommandDiscoveryService, CommandDispatcherMiddleware],
  exports: [CommandDiscoveryService, CommandDispatcherMiddleware],
})
export class CommandModule {}
