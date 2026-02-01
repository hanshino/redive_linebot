import {
  BadRequestException,
  Controller,
  Injectable,
  Logger,
} from "@nestjs/common";
import { GachaService } from "../../gacha/gacha.service";
import { LineService } from "../line.service";
import { Command } from "./decorators/command.decorator";
import type { CommandContext } from "./interfaces/command-handler.interface";

@Controller()
@Injectable()
export class GachaCommands {
  private readonly logger = new Logger(GachaCommands.name);

  constructor(
    private readonly gachaService: GachaService,
    private readonly lineService: LineService
  ) {}

  @Command("抽")
  async singleDraw({ event }: CommandContext) {
    if (event.type !== "message" || event.message.type !== "text") {
      return;
    }

    const replyToken = event.replyToken;
    if (!replyToken) {
      return;
    }

    const userId = event.source?.userId;
    if (!userId) {
      this.logger.warn("User ID not found in event source");
      return;
    }

    try {
      const pool = await this.gachaService.getActivePool();
      if (!pool) {
        await this.lineService.replyText(
          replyToken,
          "❌ 目前沒有開放中的轉蛋池"
        );
        return;
      }

      const result = await this.gachaService.performDraw(userId, pool.id, 1);
      const item = result.items[0];

      let message = "🎲 單抽結果\n\n✨ 恭喜獲得:\n";
      const star = "★".repeat(item.rarity);
      message += `${star} ${item.name}`;

      if (!item.isDuplicate) {
        message += " [NEW!]";
      } else {
        message += ` [重複 → +${item.stoneConverted} 女神石]`;
      }

      message += `\n\n💎 寶石: ${result.remainingJewels} (-150)`;
      message += `\n🎯 天井點數: +1 點 (已累積)`;

      await this.lineService.replyText(replyToken, message);
      this.logger.log(
        `User ${userId} performed single draw in pool ${pool.id}`
      );
    } catch (error) {
      this.handleError(replyToken, error);
    }
  }

  @Command("抽十")
  async tenDraw({ event }: CommandContext) {
    if (event.type !== "message" || event.message.type !== "text") {
      return;
    }

    const replyToken = event.replyToken;
    if (!replyToken) {
      return;
    }

    const userId = event.source?.userId;
    if (!userId) {
      return;
    }

    try {
      const pool = await this.gachaService.getActivePool();
      if (!pool) {
        await this.lineService.replyText(
          replyToken,
          "❌ 目前沒有開放中的轉蛋池"
        );
        return;
      }

      const result = await this.gachaService.performDraw(userId, pool.id, 10);
      let totalStones = 0;

      let message = "🎲 十連結果 ✅ 已保底 2★+\n\n✨ 本次獲得:\n";
      result.items.forEach((item, index) => {
        const star = "★".repeat(item.rarity);
        message += `${index + 1}. ${star} ${item.name}`;
        if (!item.isDuplicate) {
          message += " [NEW!]\n";
        } else {
          message += ` [重複 → +${item.stoneConverted} 石]\n`;
          totalStones += item.stoneConverted;
        }
      });

      message += `\n💎 寶石: ${result.remainingJewels} (-1500)`;
      message += `\n💠 女神石: +${totalStones}`;
      message += `\n🎯 天井點數: +10 點`;

      await this.lineService.replyText(replyToken, message);
      this.logger.log(`User ${userId} performed ten-pull in pool ${pool.id}`);
    } catch (error) {
      this.handleError(replyToken, error);
    }
  }

  @Command("抽查詢")
  async queryCeiling({ event }: CommandContext) {
    if (event.type !== "message" || event.message.type !== "text") {
      return;
    }

    const replyToken = event.replyToken;
    if (!replyToken) {
      return;
    }

    const userId = event.source?.userId;
    if (!userId) {
      return;
    }

    try {
      const pool = await this.gachaService.getActivePool();
      if (!pool) {
        await this.lineService.replyText(
          replyToken,
          "❌ 目前沒有開放中的轉蛋池"
        );
        return;
      }

      const progress = await this.gachaService.getCeilingProgress(
        userId,
        pool.id
      );
      const remaining = Math.max(0, 200 - progress.points);
      const tens = Math.ceil(remaining / 10);

      const message = `🎯 天井進度

當前點數: ${progress.points} / 200
距離兌換: 還需 ${remaining} 點 (約 ${tens} 次十連)

📊 統計:
- 總抽卡次數: ${progress.totalDraws} 次

💡 提示: 累積 200 點可兌換任意 3★ 角色
使用「#抽兌換 <角色名稱>」進行兌換`;

      await this.lineService.replyText(replyToken, message);
    } catch (error) {
      this.handleError(replyToken, error);
    }
  }

  @Command(/^抽兌換\s+(.+)$/i)
  async exchangeCeiling({ event, match }: CommandContext) {
    if (event.type !== "message" || event.message.type !== "text") {
      return;
    }

    const replyToken = event.replyToken;
    if (!replyToken) {
      return;
    }

    const userId = event.source?.userId;
    if (!userId) {
      return;
    }

    const characterName = match?.[1]?.trim();
    if (!characterName) {
      await this.lineService.replyText(
        replyToken,
        "❌ 請提供角色名稱，例如：「#抽兌換 佩可」"
      );
      return;
    }

    try {
      const pool = await this.gachaService.getActivePool();
      if (!pool) {
        await this.lineService.replyText(
          replyToken,
          "❌ 目前沒有開放中的轉蛋池"
        );
        return;
      }

      const targetItem = pool.items.find(
        (i) => i.item.name === characterName && i.item.rarity === 3
      );

      if (!targetItem) {
        await this.lineService.replyText(
          replyToken,
          `❌ 在當前池中找不到角色「${characterName}」，或該角色不是 3★`
        );
        return;
      }

      const progressBefore = await this.gachaService.getCeilingProgress(
        userId,
        pool.id
      );
      if (progressBefore.points < 200) {
        await this.lineService.replyText(
          replyToken,
          `❌ 天井點數不足！需要 200 點，目前只有 ${progressBefore.points} 點`
        );
        return;
      }

      await this.gachaService.exchangeCeiling(
        userId,
        pool.id,
        targetItem.itemId
      );

      const message = `✅ 天井兌換成功!

✨ 獲得角色:
★★★ ${characterName} [已兌換]

🎯 天井點數: ${progressBefore.points} → ${progressBefore.points - 200} (-200)
💡 重新累積中...`;

      await this.lineService.replyText(replyToken, message);
      this.logger.log(`User ${userId} exchanged ceiling for ${characterName}`);
    } catch (error) {
      this.handleError(replyToken, error);
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
