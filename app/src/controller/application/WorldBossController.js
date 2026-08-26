const { text } = require("bottender/router");
const { getClient } = require("bottender");
const SeasonService = require("../../service/WorldBossSeasonService");
const WorldBossAttackService = require("../../service/WorldBossAttackService");
const WorldBossTemplate = require("../../templates/application/WorldBoss");
const { getLiffUri } = require("../../templates/common");
const { DefaultLogger } = require("../../util/Logger");

const LineClient = getClient("line");
const WORLD_BOSS_LIFF_PATH = "/worldboss";

/**
 * `#世界王` is a shared group board: season, cycle, the five boss snapshots and the
 * one LIFF link everybody uses. Nothing about the person who typed it may appear.
 */
async function showBattleStatus(context) {
  const status = await SeasonService.getBattleStatus();
  const attackEnabled =
    context.event.source.type === "group" && context.state?.guildConfig?.WorldBossAttack === "Y";
  const bubble = WorldBossTemplate.generateWorldBossReply({
    status,
    liffUri: getLiffUri("full", WORLD_BOSS_LIFF_PATH),
    attackEnabled,
  });
  return context.replyFlex("世界王", bubble);
}

/** Handle a group attack postback using the shared attack service. */
async function attackOnBoss(context, { payload }) {
  const source = context.event.source;
  if (source.type !== "group") return;
  if (context.state?.guildConfig?.WorldBossAttack !== "Y") return;

  const { roundId, attackType } = payload || {};
  if (!["standard", "skill"].includes(attackType)) return;

  let displayName = "未知玩家";
  try {
    const profile = await LineClient.getGroupMemberProfile(source.groupId, source.userId);
    if (profile && typeof profile.displayName === "string" && profile.displayName.trim()) {
      displayName = profile.displayName.trim();
    }
  } catch (error) {
    DefaultLogger.warn("[world-boss-attack] profile lookup failed", error);
  }

  try {
    const { result } = await WorldBossAttackService.attack({
      userId: source.userId,
      roundId,
      attackType,
      displayName,
    });
    const damage = new Intl.NumberFormat("en-US").format(result.effectiveDamage);
    const firstLine = `⚔️ ${displayName} 造成 ${damage} 傷害`;
    const secondLine = result.cleared
      ? result.cycleAdvanced
        ? `🎊 ${displayName} 擊破第 ${result.attackedCycleNo} 輪最後一隻王「${result.boss.position} 號 ${result.boss.name}」，本周回五王全滅！`
        : `⚔️ ${displayName} 擊破了第 ${result.attackedCycleNo} 輪 ${result.boss.position} 號王「${result.boss.name}」！`
      : `\u3000 ${result.attackedCycleNo} 輪 ${result.boss.position} 號王「${result.boss.name}」剩餘 ${
          (BigInt(result.round.current_hp) * 100n + BigInt(result.round.max_hp) / 2n) /
          BigInt(result.round.max_hp)
        }%`;
    await context.replyText(`${firstLine}\n${secondLine}`);
  } catch (error) {
    if (["DAILY_LIMIT_EXCEEDED", "ATTACK_COOLDOWN"].includes(error && error.code)) return;
    if (["ROUND_CLEARED", "ROUND_STALE"].includes(error && error.code)) {
      await context.replyText("這隻王已被擊破，請打 #世界王 取得最新戰況");
      return;
    }
    if (["SEASON_ENDED", "NO_ACTIVE_SEASON", "NO_ACTIVE_ROUND"].includes(error && error.code)) {
      await context.replyText("世界王賽季已結束或尚未開始");
      return;
    }
    DefaultLogger.error("[world-boss-attack] failed", error);
  }
}

exports.router = [text(/^[.#/](世界王|worldboss)$/i, showBattleStatus)];
exports.showBattleStatus = showBattleStatus;
exports.attackOnBoss = attackOnBoss;
