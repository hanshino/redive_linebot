import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Role } from "@prisma/client";
import type { MiddlewareContext } from "../line/middleware/middleware.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserRole(userId: string, groupId?: string): Promise<Role> {
    const globalPermission = await this.prisma.userPermission.findFirst({
      where: {
        userId,
        groupId: null,
      },
    });

    if (globalPermission) {
      this.logger.debug(
        `User ${userId} has global permission: ${globalPermission.role}`
      );
      return globalPermission.role;
    }

    if (!groupId) {
      return Role.USER;
    }

    const groupPermission = await this.prisma.userPermission.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    if (groupPermission) {
      this.logger.debug(
        `User ${userId} has permission in group ${groupId}: ${groupPermission.role}`
      );
      return groupPermission.role;
    }

    return Role.USER;
  }

  require(ctx: MiddlewareContext, minRole: Role): void {
    if (!ctx.permission) {
      throw new Error(
        "Permission not initialized. Did you add PermissionMiddleware?"
      );
    }

    if (!this.hasRole(ctx, minRole)) {
      throw new ForbiddenException(`需要 ${minRole} 以上權限`);
    }
  }

  hasRole(ctx: MiddlewareContext, minRole: Role): boolean {
    if (!ctx.permission) {
      throw new Error(
        "Permission not initialized. Did you add PermissionMiddleware?"
      );
    }

    return this.compareRole(ctx.permission.role, minRole) >= 0;
  }

  private compareRole(userRole: Role, requiredRole: Role): number {
    const hierarchy: Record<Role, number> = {
      [Role.USER]: 1,
      [Role.GROUP_ADMIN]: 2,
      [Role.GROUP_OWNER]: 3,
      [Role.BOT_ADMIN]: 4,
      [Role.SUPER_ADMIN]: 5,
    };

    return hierarchy[userRole] - hierarchy[requiredRole];
  }

  async setPermission(
    userId: string,
    groupId: string | null,
    role: Role
  ): Promise<void> {
    if (groupId === null) {
      const existing = await this.prisma.userPermission.findFirst({
        where: { userId, groupId: null },
      });

      if (existing) {
        await this.prisma.userPermission.update({
          where: { id: existing.id },
          data: { role },
        });
      } else {
        await this.prisma.userPermission.create({
          data: { userId, groupId: null, role },
        });
      }
    } else {
      await this.prisma.userPermission.upsert({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
        update: { role },
        create: {
          userId,
          groupId,
          role,
        },
      });
    }

    this.logger.log(
      `Permission set: ${userId} -> ${role} in ${groupId || "global"}`
    );
  }

  async removePermission(
    userId: string,
    groupId: string | null
  ): Promise<void> {
    if (groupId === null) {
      const existing = await this.prisma.userPermission.findFirst({
        where: { userId, groupId: null },
      });

      if (existing) {
        await this.prisma.userPermission.delete({
          where: { id: existing.id },
        });
      }
    } else {
      await this.prisma.userPermission.delete({
        where: {
          userId_groupId: {
            userId,
            groupId,
          },
        },
      });
    }

    this.logger.log(
      `Permission removed: ${userId} from ${groupId || "global"}`
    );
  }

  async getGroupAdmins(groupId: string): Promise<string[]> {
    const permissions = await this.prisma.userPermission.findMany({
      where: {
        groupId,
        role: {
          in: [Role.GROUP_ADMIN, Role.GROUP_OWNER],
        },
      },
      select: {
        userId: true,
      },
    });

    return permissions.map((p: { userId: string }) => p.userId);
  }
}
