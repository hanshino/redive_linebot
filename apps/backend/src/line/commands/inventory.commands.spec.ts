import { Test, TestingModule } from "@nestjs/testing";
import { ItemType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryService } from "../../inventory/inventory.service";
import { LineService } from "../line.service";
import type { CommandContext } from "./interfaces/command-handler.interface";
import { InventoryCommands } from "./inventory.commands";

describe("InventoryCommands", () => {
  let commands: InventoryCommands;
  let inventoryService: InventoryService;
  let lineService: LineService;

  const mockReplyToken = "test-reply-token";
  const mockUserId = "test-user-id";

  const createMockContext = (
    text: string,
    args: string[] = [],
    match: RegExpMatchArray | null = null
  ): CommandContext => ({
    event: {
      type: "message",
      message: { type: "text", text, id: "msg-id" },
      replyToken: mockReplyToken,
      source: { userId: mockUserId, type: "user" },
      timestamp: Date.now(),
      mode: "active",
      webhookEventId: "evt-id",
      deliveryContext: { isRedelivery: false },
    } as any,
    rawText: text,
    args,
    match: match as any,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryCommands,
        {
          provide: InventoryService,
          useValue: {
            getInventory: vi.fn(),
            getCharacters: vi.fn(),
          },
        },
        {
          provide: LineService,
          useValue: {
            replyText: vi.fn(),
          },
        },
      ],
    }).compile();

    commands = module.get<InventoryCommands>(InventoryCommands);
    inventoryService = module.get<InventoryService>(InventoryService);
    lineService = module.get<LineService>(LineService);
  });

  describe("viewInventory", () => {
    it("should reply with empty message when inventory is empty", async () => {
      vi.spyOn(inventoryService, "getInventory").mockResolvedValue([]);
      const ctx = createMockContext("#背包");

      await commands.viewInventory(ctx);

      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("您的背包空空如也")
      );
    });

    it("should show characters and items in inventory", async () => {
      vi.spyOn(inventoryService, "getInventory").mockResolvedValue([
        {
          id: "1",
          userId: mockUserId,
          itemDefId: 101,
          amount: 1,
          properties: { level: 10, rank: 2, star: 3 },
          createdAt: new Date(),
          updatedAt: new Date(),
          definition: {
            id: 101,
            name: "佩可",
            type: ItemType.CHARACTER,
            rarity: 3,
            maxStack: 1,
            description: "Test",
            imageUrl: null,
            meta: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: "2",
          userId: mockUserId,
          itemDefId: 501,
          amount: 5,
          properties: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          definition: {
            id: 501,
            name: "掃蕩卷",
            type: ItemType.CONSUMABLE,
            rarity: 1,
            maxStack: 999,
            description: "Test Item",
            imageUrl: null,
            meta: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ]);

      const ctx = createMockContext("#背包");
      await commands.viewInventory(ctx);

      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("佩可 Lv.10 R2")
      );
      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("掃蕩卷 x5")
      );
    });
  });

  describe("viewCharacters", () => {
    it("should show only characters", async () => {
      vi.spyOn(inventoryService, "getCharacters").mockResolvedValue([
        {
          id: "1",
          userId: mockUserId,
          itemDefId: 101,
          amount: 1,
          properties: { level: 1, rank: 1, star: 3 },
          createdAt: new Date(),
          updatedAt: new Date(),
          definition: {
            id: 101,
            name: "佩可",
            type: ItemType.CHARACTER,
            rarity: 3,
            maxStack: 1,
            description: "Test",
            imageUrl: null,
            meta: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ]);

      const ctx = createMockContext("#背包角色");
      await commands.viewCharacters(ctx);

      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("我的角色庫")
      );
      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("佩可")
      );
    });
  });

  describe("viewDetail", () => {
    it("should show character details", async () => {
      const mockInventory = [
        {
          id: "1",
          userId: mockUserId,
          itemDefId: 101,
          amount: 1,
          properties: { level: 15, rank: 3, star: 3, bond: 5 },
          createdAt: new Date(),
          updatedAt: new Date(),
          definition: {
            id: 101,
            name: "佩可",
            type: ItemType.CHARACTER,
            rarity: 3,
            maxStack: 1,
            description: "好吃！",
            imageUrl: null,
            meta: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];
      vi.spyOn(inventoryService, "getInventory").mockResolvedValue(
        mockInventory
      );

      const match = ["#背包詳情 1", "1"] as RegExpMatchArray;
      const ctx = createMockContext("#背包詳情 1", ["1"], match);

      await commands.viewDetail(ctx);

      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("詳情資訊: 佩可")
      );
      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("等級: Lv.15")
      );
      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("好吃！")
      );
    });

    it("should handle invalid index", async () => {
      vi.spyOn(inventoryService, "getInventory").mockResolvedValue([]);

      const match = ["#背包詳情 1", "1"] as RegExpMatchArray;
      const ctx = createMockContext("#背包詳情 1", ["1"], match);

      await commands.viewDetail(ctx);

      expect(lineService.replyText).toHaveBeenCalledWith(
        mockReplyToken,
        expect.stringContaining("找不到編號")
      );
    });
  });
});
