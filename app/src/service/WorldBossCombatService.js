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
 * 命中解算（calm 階段傷害；Task 4/5 補上狂暴 ×2、致命 CAS 與進場觸發）。
 * @param {Object} param0
 * @returns {Promise<Object>}
 */
async function resolveHit({ platformId, numericUserId, eventId, attackType, level, event }) {
  void enumSkills;
  void rng;

  const jobKey = String(attackType).split("|")[0];
  const character = makeCharacter(jobKey, { level });
  // v1 DPS 一律使用 getStandardDamage（skill-specific 留待 M9，LOCK §D）
  let damage = character.getStandardDamage();

  // atk_percent 為「小數比例」（addendum §2），直接 *(1+atk_percent)
  const bonuses = await EquipmentService.getEquipmentBonuses(platformId);
  const atkPercent = (bonuses && bonuses.atk_percent) || 0;
  if (atkPercent > 0) {
    damage = Math.floor(damage * (1 + atkPercent));
  }

  const cost = WorldBossConfig.getNormalAttackCost();

  // 階段判定：剩餘血量是否已進狂暴帶（HP 動態計算，無 remain_hp 欄位，addendum §6）
  const dmgRow = await WorldBossLog.getTotalDamageByEventId(eventId);
  const totalDamage = parseInt((dmgRow && dmgRow.total_damage) || 0, 10);
  const remainHpBefore = event.hp - totalDamage;
  const enraged =
    remainHpBefore <= (event.hp * WorldBossConfig.readEnrageThresholdPct(event)) / 100;

  // getRecentAttackers 供 M4.4/M4.5 狂暴觸發批次倒地使用，calm 路徑暫留備用
  void WorldBossLog.getRecentAttackers({
    eventId,
    minutes: WorldBossConfig.readEnrageRecentMinutes(),
    limit: WorldBossConfig.readEnrageBatchSize(event),
  });

  const contribution = damage; // DPS 榜：contribution 鏡像 damage

  await WorldBossLog.createWithRole({
    user_id: numericUserId,
    world_boss_event_id: eventId,
    role: "dps",
    action_type: attackType,
    damage,
    cost,
    contribution,
  });

  return {
    damage,
    contribution,
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
