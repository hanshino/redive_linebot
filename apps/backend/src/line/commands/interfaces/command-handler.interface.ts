import type { WebhookEvent } from "../../types/events";

export interface CommandHandler {
  controllerName: string;
  methodName: string;
  instance: any;
  method: Function;
  options: CommandOptions | OnEventOptions | PostbackOptions;
  type: "command" | "event" | "postback";
}

export interface CommandOptions {
  command: string | RegExp;
  aliases?: string[];
  description?: string;
  prefix?: boolean;
  priority?: number;
}

export interface OnEventOptions {
  type: string;
  description?: string;
}

export interface PostbackOptions {
  action: string;
  description?: string;
}

export interface CommandContext {
  event: WebhookEvent;
  rawText?: string;
  args?: string[];
  match?: RegExpMatchArray;
}
