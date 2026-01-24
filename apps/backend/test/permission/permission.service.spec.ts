import { Test, TestingModule } from "@nestjs/testing";
import { Role } from "@prisma/client";
import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionService } from "../../src/permission/permission.service";
import { PrismaService } from "../../src/prisma/prisma.service";

describe("PermissionService", () => {
  let service: PermissionService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      userPermission: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getUserRole", () => {
    it("should return global permission if exists", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValueOnce({
        id: "1",
        userId: "U123",
        groupId: null,
        role: Role.BOT_ADMIN,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const role = await service.getUserRole("U123", "C456");

      expect(role).toBe(Role.BOT_ADMIN);
    });

    it("should return group permission if no global permission", async () => {
      mockPrisma.userPermission.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "2",
          userId: "U123",
          groupId: "C456",
          role: Role.GROUP_ADMIN,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const role = await service.getUserRole("U123", "C456");

      expect(role).toBe(Role.GROUP_ADMIN);
    });

    it("should return USER if no permission found", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue(null);

      const role = await service.getUserRole("U123", "C456");

      expect(role).toBe(Role.USER);
    });

    it("should return USER if no groupId provided and no global permission", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue(null);

      const role = await service.getUserRole("U123");

      expect(role).toBe(Role.USER);
    });
  });

  describe("hasRole", () => {
    it("should return true if user has sufficient role", () => {
      const ctx: any = {
        permission: {
          userId: "U123",
          groupId: "C456",
          role: Role.GROUP_ADMIN,
        },
      };

      expect(service.hasRole(ctx, Role.USER)).toBe(true);
      expect(service.hasRole(ctx, Role.GROUP_ADMIN)).toBe(true);
    });

    it("should return false if user has insufficient role", () => {
      const ctx: any = {
        permission: {
          userId: "U123",
          groupId: "C456",
          role: Role.USER,
        },
      };

      expect(service.hasRole(ctx, Role.GROUP_ADMIN)).toBe(false);
      expect(service.hasRole(ctx, Role.GROUP_OWNER)).toBe(false);
    });

    it("should throw error if permission not initialized", () => {
      const ctx: any = {};

      expect(() => service.hasRole(ctx, Role.USER)).toThrow(
        "Permission not initialized"
      );
    });
  });

  describe("setPermission", () => {
    it("should upsert user permission", async () => {
      mockPrisma.userPermission.upsert.mockResolvedValue({});

      await service.setPermission("U123", "C456", Role.GROUP_ADMIN);

      expect(mockPrisma.userPermission.upsert).toHaveBeenCalledWith({
        where: {
          userId_groupId: {
            userId: "U123",
            groupId: "C456",
          },
        },
        update: { role: Role.GROUP_ADMIN },
        create: {
          userId: "U123",
          groupId: "C456",
          role: Role.GROUP_ADMIN,
        },
      });
    });
  });

  describe("getGroupAdmins", () => {
    it("should return list of admin user IDs", async () => {
      mockPrisma.userPermission.findMany.mockResolvedValue([
        { userId: "U123" },
        { userId: "U456" },
      ]);

      const admins = await service.getGroupAdmins("C456");

      expect(admins).toEqual(["U123", "U456"]);
      expect(mockPrisma.userPermission.findMany).toHaveBeenCalledWith({
        where: {
          groupId: "C456",
          role: {
            in: [Role.GROUP_ADMIN, Role.GROUP_OWNER],
          },
        },
        select: {
          userId: true,
        },
      });
    });
  });
});
