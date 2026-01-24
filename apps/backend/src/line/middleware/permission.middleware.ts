import { Injectable, Logger } from "@nestjs/common";
import { PermissionService } from "../../permission/permission.service";
import type {
  LineMiddleware,
  MiddlewareContext,
  NextFunction,
} from "./middleware.types";

@Injectable()
export class PermissionMiddleware implements LineMiddleware {
  private readonly logger = new Logger(PermissionMiddleware.name);

  constructor(private readonly permissionService: PermissionService) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const userId = this.extractUserId(ctx.event);
    const groupId = this.extractGroupId(ctx.event);

    if (!userId) {
      this.logger.warn("Cannot extract userId from event");
      return next();
    }

    const role = await this.permissionService.getUserRole(userId, groupId);

    ctx.permission = {
      userId,
      groupId,
      role,
    };

    this.logger.debug(
      `Permission injected: ${userId} -> ${role} in ${groupId || "private"}`
    );

    await next();
  }

  private extractUserId(event: any): string | undefined {
    return event.source?.userId;
  }

  private extractGroupId(event: any): string | undefined {
    return event.source?.groupId;
  }
}
