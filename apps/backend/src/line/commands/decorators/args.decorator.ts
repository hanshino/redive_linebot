import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Args = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest();
    return request.commandContext?.args || [];
  }
);
