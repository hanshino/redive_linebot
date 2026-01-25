import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const Match = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RegExpMatchArray | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.commandContext?.match;
  }
);
