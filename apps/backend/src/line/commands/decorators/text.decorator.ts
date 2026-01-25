import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Text = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.commandContext?.rawText;
  }
);
