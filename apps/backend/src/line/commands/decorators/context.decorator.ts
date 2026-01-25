import type { WebhookEvent } from "@line/bot-sdk";
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Context = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WebhookEvent => {
    const request = ctx.switchToHttp().getRequest();
    return request.event as WebhookEvent;
  }
);
