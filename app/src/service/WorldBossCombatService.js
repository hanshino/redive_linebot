const UserModel = require("../model/application/UserModel");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const WorldBossLog = require("../model/application/WorldBossLog");
const wbRedis = require("../util/worldBossRedis");
const EquipmentService = require("./EquipmentService");
const WorldBossConfig = require("./WorldBossConfig");
const { make: makeCharacter, enumSkills } = require("../model/application/RPGCharacter");

let rng = Math.random;

/**
 * 倒下狀態判定（含自然恢復的懶評估，LOCK §C/§D）。
 * 讀 poolScore；若已過恢復時間 → poolRemove 並視為站起（false）；
 * 仍在窗口內 → true；池中無此人 → false。
 * @param {Number} eventId
 * @param {String} platformId
 * @param {Number} recoveryMinutes
 * @param {Number} now ms timestamp
 * @returns {Promise<Boolean>}
 */
async function isKnockedDown(eventId, platformId, recoveryMinutes, now) {
  const score = await wbRedis.poolScore(eventId, platformId);
  if (score === null) {
    return false;
  }
  if (score + recoveryMinutes * 60000 <= now) {
    await wbRedis.poolRemove(eventId, platformId);
    return false;
  }
  return true;
}

/**
 * DPS 攻擊（解算刀）。所有副作用綁在此次出手。
 * 本檔為 WorldBossCombatService 的唯一建立者（M4，LOCK §A）；tank/healer 動詞由 M5「新增」，
 * 不重建本檔、不重定義 dpsAttack。數字 user.id 一律經 UserModel.getId（LOCK §D，無 _resolveNumericId）。
 * @param {Object} param0
 * @param {String} param0.platformId  LINE platform_id
 * @param {Number} param0.numericUserId  內部數字 user.id（缺漏時由 UserModel.getId 自解）
 * @param {Number} param0.eventId
 * @param {String} param0.attackType  "<jobKey>|<skill>"
 * @param {Number} param0.level  聊天等級
 * @returns {Promise<Object>}
 */
async function dpsAttack({ platformId, numericUserId, eventId, attackType, level }) {
  const event = await WorldBossEvent.getActive();
  if (!event || event.id !== eventId || event.status !== "active") {
    return rejectAttack("not_active");
  }

  const recoveryMinutes = WorldBossConfig.readNaturalRecoveryMinutes(event);
  const knocked = await isKnockedDown(eventId, platformId, recoveryMinutes, Date.now());
  if (knocked) {
    return rejectAttack("knocked_down");
  }

  const resolvedUserId =
    numericUserId === null || numericUserId === undefined
      ? await UserModel.getId(platformId)
      : numericUserId;

  // 傷害、狂暴帶與觸發解算於 Task 3-5 接續實作
  return resolveHit({
    platformId,
    numericUserId: resolvedUserId,
    eventId,
    attackType,
    level,
    event,
  });
}

/**
 * 統一駁回回傳（不寫 log、不扣精力）。
 * @param {String} reason
 * @returns {Object}
 */
function rejectAttack(reason) {
  return {
    damage: 0,
    contribution: 0,
    enraged: false,
    didEnrageTrigger: false,
    knockedBatch: [],
    selfKnocked: false,
    rejected: true,
    reason,
  };
}

/**
 * 實際命中解算（Task 3-5 接續實作）。
 */
async function resolveHit({ platformId, numericUserId, eventId, attackType, level, event }) {
  void enumSkills;
  void rng;

  const [equipBonuses, dmgRow] = await Promise.all([
    EquipmentService.getEquipmentBonuses(platformId),
    WorldBossLog.getTotalDamageByEventId(eventId),
  ]);

  const [jobKey] = attackType.split("|");
  const character = makeCharacter(jobKey, { level });
  const baseDamage = character.getStandardDamage();
  const atkPct = (equipBonuses && equipBonuses.atk_percent) || 0;
  const damage = Math.floor(baseDamage * (1 + atkPct));

  const totalDamage = parseInt((dmgRow && dmgRow.total_damage) || 0, 10);
  const remainHpBefore = event.hp - totalDamage;
  const enraged =
    remainHpBefore <=
    event.hp *
      (WorldBossConfig.readEnrageThresholdPct
        ? WorldBossConfig.readEnrageThresholdPct(event) / 100
        : 0.35);

  const recentAttackers = await WorldBossLog.getRecentAttackers({
    eventId,
    minutes: WorldBossConfig.readEnrageRecentMinutes
      ? WorldBossConfig.readEnrageRecentMinutes()
      : 10,
    limit: WorldBossConfig.readEnrageBatchSize ? WorldBossConfig.readEnrageBatchSize(event) : 20,
  });

  void recentAttackers;

  await WorldBossLog.createWithRole({
    user_id: numericUserId,
    world_boss_event_id: eventId,
    role: "dps",
    action_type: "attack",
    damage,
    cost: 0,
    contribution: damage,
  });

  return {
    damage,
    contribution: damage,
    enraged,
    didEnrageTrigger: false,
    knockedBatch: [],
    selfKnocked: false,
    rejected: false,
    reason: null,
  };
}

module.exports = {
  dpsAttack,
  // 測試專用 RNG 注入縫（production 用 Math.random）
  _setRng: fn => {
    rng = fn;
  },
};
