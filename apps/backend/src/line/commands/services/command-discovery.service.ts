import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import {
  COMMAND_METADATA,
  EVENT_METADATA,
  POSTBACK_METADATA,
} from "../decorators/metadata.keys";
import type {
  CommandHandler,
  CommandOptions,
  OnEventOptions,
  PostbackOptions,
} from "../interfaces/command-handler.interface";

@Injectable()
export class CommandDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(CommandDiscoveryService.name);

  private readonly commandMap = new Map<string, CommandHandler>();
  private readonly regexCommandHandlers: Array<{
    pattern: RegExp;
    handler: CommandHandler;
  }> = [];
  private readonly eventHandlers = new Map<string, CommandHandler[]>();
  private readonly postbackHandlers = new Map<string, CommandHandler>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log("Scanning for command handlers...");
    await this.scanForHandlers();
    this.logRegisteredHandlers();
  }

  private async scanForHandlers(): Promise<void> {
    const controllers = this.discoveryService.getControllers();

    for (const wrapper of controllers) {
      const { instance } = wrapper;
      if (!instance) continue;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const method = prototype[methodName];
        if (typeof method !== "function") continue;

        this.registerCommandHandler(instance, methodName, method);
        this.registerEventHandler(instance, methodName, method);
        this.registerPostbackHandler(instance, methodName, method);
      }
    }
  }

  private registerCommandHandler(
    instance: any,
    methodName: string,
    method: Function
  ): void {
    const metadata = this.reflector.get<CommandOptions>(
      COMMAND_METADATA,
      method
    );
    if (!metadata) return;

    const handler: CommandHandler = {
      controllerName: instance.constructor.name,
      methodName,
      instance,
      method,
      options: metadata,
      type: "command",
    };

    if (metadata.command instanceof RegExp) {
      this.regexCommandHandlers.push({
        pattern: metadata.command,
        handler,
      });
      this.logger.debug(
        `Registered regex command: ${metadata.command.source} -> ${handler.controllerName}.${methodName}`
      );
    } else {
      this.registerStringCommand(metadata.command, handler);

      if (metadata.aliases) {
        for (const alias of metadata.aliases) {
          this.registerStringCommand(alias, handler);
        }
      }
    }
  }

  private registerStringCommand(
    command: string,
    handler: CommandHandler
  ): void {
    const existing = this.commandMap.get(command);
    if (existing) {
      throw new Error(
        `Duplicate command registration: "${command}" is already registered by ${existing.controllerName}.${existing.methodName}`
      );
    }

    this.commandMap.set(command, handler);
    this.logger.debug(
      `Registered command: ${command} -> ${handler.controllerName}.${handler.methodName}`
    );
  }

  private registerEventHandler(
    instance: any,
    methodName: string,
    method: Function
  ): void {
    const metadata = this.reflector.get<OnEventOptions>(EVENT_METADATA, method);
    if (!metadata) return;

    const handler: CommandHandler = {
      controllerName: instance.constructor.name,
      methodName,
      instance,
      method,
      options: metadata,
      type: "event",
    };

    const handlers = this.eventHandlers.get(metadata.type) || [];
    handlers.push(handler);
    this.eventHandlers.set(metadata.type, handlers);

    this.logger.debug(
      `Registered event handler: ${metadata.type} -> ${handler.controllerName}.${methodName}`
    );
  }

  private registerPostbackHandler(
    instance: any,
    methodName: string,
    method: Function
  ): void {
    const metadata = this.reflector.get<PostbackOptions>(
      POSTBACK_METADATA,
      method
    );
    if (!metadata) return;

    const handler: CommandHandler = {
      controllerName: instance.constructor.name,
      methodName,
      instance,
      method,
      options: metadata,
      type: "postback",
    };

    const existing = this.postbackHandlers.get(metadata.action);
    if (existing) {
      throw new Error(
        `Duplicate postback registration: "${metadata.action}" is already registered by ${existing.controllerName}.${existing.methodName}`
      );
    }

    this.postbackHandlers.set(metadata.action, handler);
    this.logger.debug(
      `Registered postback: ${metadata.action} -> ${handler.controllerName}.${methodName}`
    );
  }

  private logRegisteredHandlers(): void {
    this.logger.log(
      `Registered ${this.commandMap.size} string commands, ${this.regexCommandHandlers.length} regex commands`
    );
    this.logger.log(
      `Registered ${this.eventHandlers.size} event types, ${this.postbackHandlers.size} postback actions`
    );
  }

  findCommandHandler(text: string): CommandHandler | null {
    return this.commandMap.get(text) || null;
  }

  findRegexCommandHandler(
    text: string
  ): { handler: CommandHandler; match: RegExpMatchArray } | null {
    for (const { pattern, handler } of this.regexCommandHandlers) {
      const match = text.match(pattern);
      if (match) {
        return { handler, match };
      }
    }
    return null;
  }

  findEventHandlers(eventType: string): CommandHandler[] {
    return this.eventHandlers.get(eventType) || [];
  }

  findPostbackHandler(action: string): CommandHandler | null {
    return this.postbackHandlers.get(action) || null;
  }
}
