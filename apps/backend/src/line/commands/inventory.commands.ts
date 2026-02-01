import {
  BadRequestException,
  Controller,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ItemType } from "@prisma/client";
import { InventoryService } from "../../inventory/inventory.service";
import { LineService } from "../line.service";
import { Command } from "./decorators/command.decorator";
import type { CommandContext } from "./interfaces/command-handler.interface";

@Controller()
@Injectable()
export class InventoryCommands {
  private readonly logger = new Logger(InventoryCommands.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly lineService: LineService
  ) {}

  @Command({ command: "背包", aliases: ["bag"] })
  async viewInventory({ event, args }: CommandContext) {
    const replyToken = this.getReplyToken(event);
    const userId = this.getUserId(event);
    if (!replyToken || !userId) return;

    try {
      const inventory = await this.inventoryService.getInventory(userId);
      const page = this.parsePage(args || []);
      const pageSize = 20;

      const characters = inventory.filter(
        (i) => i.definition.type === ItemType.CHARACTER
      );
      const items = inventory.filter(
        (i) => i.definition.type !== ItemType.CHARACTER
      );

      const totalItems = characters.length + items.length;
      if (totalItems === 0) {
        await this.lineService.replyText(replyToken, "📦 您的背包空空如也");
        return;
      }

      const totalPages = Math.ceil(totalItems / pageSize);
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedItems = inventory.slice(start, end);

      let message = `📦 我的背包 (第 ${page}/${totalPages} 頁)\n`;

      const charInPage = paginatedItems.filter(
        (i) => i.definition.type === ItemType.CHARACTER
      );
      if (charInPage.length > 0) {
        message += `\n✨ 角色 (${characters.length}):\n`;
        charInPage.forEach((item, index) => {
          const props = item.properties as any;
          const star = "★".repeat(props?.star || item.definition.rarity);
          message += `${start + index + 1}. ${star} ${
            item.definition.name
          } Lv.${props?.level || 1} R${props?.rank || 1}\n`;
        });
      }

      const otherInPage = paginatedItems.filter(
        (i) => i.definition.type !== ItemType.CHARACTER
      );
      if (otherInPage.length > 0) {
        message += `\n📦 道具 (${items.length}):\n`;
        otherInPage.forEach((item, index) => {
          message += `${start + charInPage.length + index + 1}. ${
            item.definition.name
          } x${item.amount}\n`;
        });
      }

      if (totalPages > 1 && page < totalPages) {
        message += `\n📖 使用「#背包 ${page + 1}」查看下一頁`;
      }

      message += `\n\n💎 使用「#背包詳情 <編號>」查看角色詳細資訊`;

      await this.lineService.replyText(replyToken, message.trim());
    } catch (error) {
      await this.handleError(replyToken, error);
    }
  }

  @Command({ command: "背包角色", aliases: ["bag characters"] })
  async viewCharacters({ event, args }: CommandContext) {
    const replyToken = this.getReplyToken(event);
    const userId = this.getUserId(event);
    if (!replyToken || !userId) return;

    try {
      const characters = await this.inventoryService.getCharacters(userId);
      const page = this.parsePage(args || []);
      const pageSize = 20;

      if (characters.length === 0) {
        await this.lineService.replyText(replyToken, "✨ 您尚未擁有任何角色");
        return;
      }

      const totalPages = Math.ceil(characters.length / pageSize);
      const start = (page - 1) * pageSize;
      const paginatedChars = characters.slice(start, start + pageSize);

      let message = `✨ 我的角色庫 (第 ${page}/${totalPages} 頁)\n`;
      message += `總計: ${characters.length} 位角色\n\n`;

      paginatedChars.forEach((item, index) => {
        const props = item.properties as any;
        const star = "★".repeat(props?.star || item.definition.rarity);
        message += `${start + index + 1}. ${star} ${
          item.definition.name
        } (Lv.${props?.level || 1} R${props?.rank || 1})\n`;
      });

      if (totalPages > 1 && page < totalPages) {
        message += `\n📖 使用「#背包角色 ${page + 1}」查看下一頁`;
      }

      message += `\n\n💎 使用「#背包詳情 <編號>」查看角色詳細資訊`;

      await this.lineService.replyText(replyToken, message.trim());
    } catch (error) {
      await this.handleError(replyToken, error);
    }
  }

  @Command({
    command: /^背包詳情\s+(\d+)$/i,
  })
  async viewDetail({ event, match }: CommandContext) {
    const replyToken = this.getReplyToken(event);
    const userId = this.getUserId(event);
    if (!replyToken || !userId) return;

    const index = parseInt(match?.[1] || "0", 10) - 1;
    if (index < 0) {
      await this.lineService.replyText(
        replyToken,
        "❌ 請輸入有效的編號，例如：「#背包詳情 1」"
      );
      return;
    }

    try {
      const inventory = await this.inventoryService.getInventory(userId);
      const item = inventory[index];

      if (!item) {
        await this.lineService.replyText(
          replyToken,
          `❌ 找不到編號為 ${index + 1} 的項目`
        );
        return;
      }

      const { definition, properties } = item;
      const props = properties as any;

      let message = `🔍 詳情資訊: ${definition.name}\n`;
      message += `━━━━━━━━━━━━━━━\n`;

      if (definition.type === ItemType.CHARACTER) {
        const star = "★".repeat(props?.star || definition.rarity);
        message += `✨ 角色資訊:\n`;
        message += `- 稀有度: ${star}\n`;
        message += `- 等級: Lv.${props?.level || 1}\n`;
        message += `- 秩階: Rank ${props?.rank || 1}\n`;
        message += `- 羈絆: Lv.${props?.bond || 0}\n`;

        if (definition.description) {
          message += `\n📝 角色描述:\n${definition.description}\n`;
        }
      } else {
        message += `- 類型: ${this.formatItemType(definition.type)}\n`;
        message += `- 持有數量: ${item.amount}\n`;
        if (definition.description) {
          message += `- 描述: ${definition.description}\n`;
        }
      }

      await this.lineService.replyText(replyToken, message.trim());
    } catch (error) {
      await this.handleError(replyToken, error);
    }
  }

  @Command({
    command: /^bag\s+detail\s+(\d+)$/i,
  })
  async viewDetailEn(ctx: CommandContext) {
    return this.viewDetail(ctx);
  }

  private getReplyToken(event: any): string | null {
    if (event.type !== "message" && event.type !== "postback") return null;
    return event.replyToken || null;
  }

  private getUserId(event: any): string | null {
    return event.source?.userId || null;
  }

  private parsePage(args: string[]): number {
    if (!args || args.length === 0) return 1;
    const page = parseInt(args[0], 10);
    return isNaN(page) || page < 1 ? 1 : page;
  }

  private formatItemType(type: ItemType): string {
    switch (type) {
      case ItemType.CHARACTER:
        return "角色";
      case ItemType.CONSUMABLE:
        return "消耗品";
      case ItemType.EQUIPMENT:
        return "裝備";
      case ItemType.CURRENCY:
        return "貨幣";
      default:
        return type;
    }
  }

  private async handleError(replyToken: string, error: any) {
    this.logger.error(error);
    const errorMessage =
      error instanceof BadRequestException
        ? `❌ ${error.message}`
        : "❌ 發生未知錯誤，請稍後再試";
    await this.lineService.replyText(replyToken, errorMessage);
  }
}
