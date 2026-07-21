const config = require("config");
const { text } = require("bottender/router");
const BattleService = require("../../service/WorldBossBattleService");
const SeasonService = require("../../service/WorldBossSeasonService");
const MinigameService = require("../../service/MinigameService");
const EquipmentService = require("../../service/EquipmentService");
const RPGCharacter = require("../../model/application/RPGCharacter");
const WorldBossTemplate = require("../../templates/application/WorldBoss");
const { getLiffUri } = require("../../templates/common");
const redis = require("../../util/redis");
const AchievementEngine = require("../../service/AchievementEngine");
const { notifyUnlocks } = require("../../service/achievementNotifier");

const WORLD_BOSS_LIFF_PATH = "/worldboss";
const COOLDOWN_SECONDS = config.get("worldboss.attack_cooldown_seconds");
const PER_HIT_EXP = config.get("worldboss.per_hit_exp");

function nonNegativeFinite(value) {
  return Math.max(0, Number(value) || 0);
}

function attackInput({ progress, bonuses, attackType }) {
  const character = RPGCharacter.make(progress.job_key, { level: progress.level });
  const isSkill = attackType === "skill";
  const baseDamage = isSkill ? character.getSkillOneDamage() : character.getStandardDamage();
  const baseCost = isSkill ? character.skillOne.cost : 10;
  const atkPercent = nonNegativeFinite(bonuses.atk_percent);
  const costReduction = nonNegativeFinite(bonuses.cost_reduction);
  const expBonus = nonNegativeFinite(bonuses.exp_bonus);

  return {
    damage: Math.floor(baseDamage * (1 + atkPercent)),
    cost: Math.max(1, baseCost - costReduction),
    exp: PER_HIT_EXP + expBonus,
  };
}

async function showBattleStatus(context) {
  const { userId } = context.event.source;
  if (!userId) return context.replyText("無法辨識玩家，請稍後再試。");

  const [status, daily, latestReward] = await Promise.all([
    SeasonService.getBattleStatus(),
    BattleService.getRemainingDailyCost(userId),
    SeasonService.getLatestSettledResult(userId),
  ]);
  const bubble = WorldBossTemplate.generateWorldBossReply({
    status,
    daily,
    latestReward,
    liffUri: getLiffUri("full", WORLD_BOSS_LIFF_PATH),
  });
  return context.replyFlex("世界王", bubble);
}

async function attackOnBoss(context, { payload }) {
  const { userId } = context.event.source;
  const attackType = payload && payload.attackType;
  if (!userId) return context.replyText("無法辨識玩家，請稍後再試。");
  if (!new Set(["standard", "skill"]).has(attackType)) {
    return context.replyText("攻擊類型無效，請重新開啟世界王卡片。");
  }

  const cooldownKey = `worldboss-v2:${userId}`;
  const cooldownReserved = await redis.set(cooldownKey, 1, {
    EX: COOLDOWN_SECONDS,
    NX: true,
  });
  if (!cooldownReserved) return context.replyText("攻擊冷卻中，請稍候再試。");

  const [storedProgress, bonuses] = await Promise.all([
    MinigameService.findByUserId(userId),
    EquipmentService.getEquipmentBonuses(userId),
  ]);
  const progress = storedProgress || { level: 1, job_key: "adventurer" };
  const { damage, cost, exp } = attackInput({ progress, bonuses, attackType });
  const daily = await BattleService.getRemainingDailyCost(userId);
  if (daily.remaining < cost) return context.replyText("今日行動額度不足，請明天再來挑戰。");

  let result;
  try {
    result = await BattleService.attack({ userId, attackType, damage, cost, exp });
  } catch (error) {
    if (["DAILY_LIMIT_EXCEEDED"].includes(error && error.code)) {
      return context.replyText("今日行動額度不足，請明天再來挑戰。");
    }
    if (["NO_ACTIVE_SEASON", "SEASON_ENDED", "NO_ACTIVE_ROUND"].includes(error && error.code)) {
      return showBattleStatus(context);
    }
    throw error;
  }

  const latestReward = await SeasonService.getLatestSettledResult(userId);
  const bubble = WorldBossTemplate.generateAttackResultBubble({
    result,
    daily: result.daily,
    latestReward,
    liffUri: getLiffUri("full", WORLD_BOSS_LIFF_PATH),
  });
  await context.replyFlex("世界王攻擊", bubble);

  const achievement = await AchievementEngine.evaluate(userId, "boss_attack", {
    feature: "world_boss",
  }).catch(() => ({ unlocked: [] }));
  await notifyUnlocks(context, userId, achievement.unlocked);
}

exports.router = [text(/^[.#/](世界王|worldboss)$/i, showBattleStatus)];
exports.showBattleStatus = showBattleStatus;
exports.attackOnBoss = attackOnBoss;
exports._internal = { attackInput, nonNegativeFinite };
