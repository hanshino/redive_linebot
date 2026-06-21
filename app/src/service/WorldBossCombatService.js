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
  const enrageThreshold = (event.hp * WorldBossConfig.readEnrageThresholdPct(event)) / 100;
  const enraged = remainHpBefore <= enrageThreshold;

  // 狂暴帶（本刀「開始時」就在帶內）：傷害 ×2（LOCK §D，於寫帳前套用）。
  // 跨越門檻的那一刀因起始在 calm（enraged=false）不在此放大——它改為觸發進場批次（Task 5）。
  if (enraged) {
    damage = damage * WorldBossConfig.getEnrageDamageMultiplier();
  }

  // contribution 鏡像 damage：狂暴時 damage 已含 ×2，等同 contribution 也 ×2（LOCK §D）。
  // getEnrageContributionMultiplier() 與 getEnrageDamageMultiplier() 相等，故僅套用一次、不二次相乘。
  const contribution = damage;

  await WorldBossLog.createWithRole({
    user_id: numericUserId,
    world_boss_event_id: eventId,
    role: "dps",
    action_type: attackType,
    damage,
    cost,
    contribution,
  });

  const remainHpAfter = remainHpBefore - damage;
  const now = Date.now();

  let didEnrageTrigger = false;
  let knockedBatch = [];
  let selfKnocked = false;

  // 致命刀：CAS active→killed（結算交給 M7，stamp killed_at）。死王不觸發進場批次（沒有戰場可信用）。
  if (remainHpAfter <= 0) {
    await WorldBossEvent.casStatus(eventId, "active", "killed", { killed_at: new Date() });
  } else {
    // 跨越門檻的那「一刀」觸發進場批次（之後的狂暴刀不再重觸發；此刀起始在 calm，故未被 ×2）。
    const crossed = remainHpBefore > enrageThreshold && remainHpAfter <= enrageThreshold;
    if (crossed) {
      didEnrageTrigger = true;
      knockedBatch = await runEnrageBatch({ eventId, event, now });
    }

    // 狂暴期持續反擊：本刀「開始時」就在狂暴帶且骰中縮放後反擊機率 → 自己被擊倒進池（member = platform_id）
    // D30 cold-start: scaledCounterRate = baseCounterRate * (1 - supportRatio)；ratio=0 → full rate
    if (enraged) {
      const { scaledCounterRate } = await exports.getEnrageScaling(eventId, {
        baseBatch: WorldBossConfig.readEnrageBatchSize(event),
        baseCounterRate: WorldBossConfig.readEnrageCounterRate(event),
      });
      if (rng() < scaledCounterRate) {
        await wbRedis.poolAdd(eventId, platformId, now);
        selfKnocked = true;
      }
    }
  }

  return {
    damage,
    contribution,
    enraged,
    didEnrageTrigger,
    knockedBatch,
    selfKnocked,
    rejected: false,
    reason: null,
  };
}

/**
 * 進場批次：撈最近 N 個攻擊者，逐一嘗試被坦克牆/護盾吸收，否則打進待救池。
 * 被吸收時為 owner 代寫一筆貢獻 LOG（LOCK §B/§D 落帳時序）。
 * pool / shield / block 的 member 與 owner 一律為 platform_id（LOCK §B）；
 * 代寫 LOG 前一律以 UserModel.getId 將 owner 的 platform_id 轉成數字 user_id（LOCK §D）；
 * 找不到 user 列（已刪帳號）則略過該筆代寫（不誤算）。
 * @param {Object} param0
 * @param {Number} param0.eventId
 * @param {Object} param0.event
 * @param {Number} param0.now
 * @returns {Promise<String[]>} 實際被打進池的 platformId 清單
 */
async function runEnrageBatch({ eventId, event, now }) {
  const minutes = WorldBossConfig.readEnrageRecentMinutes();
  const baseBatch = WorldBossConfig.readEnrageBatchSize(event);
  const baseCounterRate = WorldBossConfig.readEnrageCounterRate(event);
  const { scaledBatch } = await exports.getEnrageScaling(eventId, { baseBatch, baseCounterRate });
  const candidates = await WorldBossLog.getRecentAttackers({
    eventId,
    minutes,
    limit: scaledBatch,
  });

  const knockedBatch = [];
  let blockUsed = false;
  const owner = await wbRedis.blockOwner(eventId);

  for (const candidate of candidates) {
    const target = candidate.platform_id;

    // 坦克牆吸收（v1 單一名額）
    if (owner && !blockUsed) {
      blockUsed = true;
      await writeAbsorbContribution(eventId, "tank", "block_absorb", owner);
      continue;
    }

    // 護盾吸收（per-target token，GETDEL 消耗即刪）
    const shieldOwner = await wbRedis.shieldConsume(eventId, target);
    if (shieldOwner) {
      await writeAbsorbContribution(eventId, "healer", "shield_absorb", shieldOwner);
      continue;
    }

    // 沒被吸收 → 打進待救池（member = platform_id）
    await wbRedis.poolAdd(eventId, target, now);
    knockedBatch.push(target);
  }

  return knockedBatch;
}

/**
 * 為被吸收的擊倒代寫一筆 +1 貢獻 LOG。owner 以 platform_id 給入，於此處經 UserModel.getId
 * 轉數字 user_id；找不到 user 列則略過（LOCK §B/§D，不誤算）。
 * @param {Number} eventId
 * @param {String} role  "tank" | "healer"
 * @param {String} actionType
 * @param {String} ownerPlatformId
 * @returns {Promise<void>}
 */
async function writeAbsorbContribution(eventId, role, actionType, ownerPlatformId) {
  const ownerNumericId = await UserModel.getId(ownerPlatformId);
  if (ownerNumericId === null) {
    return;
  }
  await WorldBossLog.createWithRole({
    user_id: ownerNumericId,
    world_boss_event_id: eventId,
    role,
    action_type: actionType,
    damage: 0,
    cost: 0,
    contribution: 1,
  });
}

/**
 * D30 冷啟動壓力縮放（addendum §15 共用 support ratio）。
 * M4 的暴走處理器以 baseBatch / baseCounterRate 呼叫此函式，依「活躍補/坦比例」縮小批次與反擊率。
 * supportRatio 來自 M1 的 WorldBossLog.getSupportRatio（distinct-user 定義，與 M7 經濟層共用同一定義）。
 * ratio → 0（全 DPS 冷啟動伺服器）⇒ 全批次（最大壓力）；ratio 升高 ⇒ 批次縮小（支援獎勵的一環）。
 * @param {Number} eventId
 * @param {{baseBatch: Number, baseCounterRate: Number}} knobs  M4 由 world_boss 欄位/config 讀出的基礎值
 * @returns {Promise<{supportRatio: Number, scaledBatch: Number, scaledCounterRate: Number}>}
 */
exports.getEnrageScaling = async (eventId, { baseBatch, baseCounterRate }) => {
  const supportRatio = await WorldBossLog.getSupportRatio(eventId);
  const scaledBatch = Math.max(1, Math.round(baseBatch * (1 - supportRatio)));
  const scaledCounterRate = baseCounterRate * (1 - supportRatio);
  return { supportRatio, scaledBatch, scaledCounterRate };
};

exports.dpsAttack = dpsAttack;
// 測試專用 RNG 注入縫（production 用 Math.random）
exports._setRng = fn => {
  rng = fn;
};

/**
 * 補師復活：從救援池 ZPOPMIN K 個最舊的擊倒玩家（platform_id），立刻寫入自己的 contribution。
 * K = getReviveCountK() + 裝備 support_power。即使救活 0 人仍計費並寫參與列（D22）。
 * 結果 shape 鎖定：{ rejected, reason, revived: [platformId...], contribution }（lock §D）。
 * @param {{platformId: String, numericUserId: Number, eventId: Number}} param0
 */
/**
 * 補師護盾：對最近的攻擊者開立免疫 token（shieldSet，owner = 補師 platform_id），最多 K 個。
 * 本動作不立刻寫貢獻——當護盾真的擋下擊倒時，由 M4 暴走處理器回寫貢獻並計給 OWNER（lock §D 時序契約）。
 * K = getShieldCountK() + 裝備 support_power。TTL = getNaturalRecoveryMinutes()*60。
 * 仍寫一筆 D22 參與列（contribution:0、計費），讓補師通過參與門檻。
 * 結果 shape 鎖定：{ rejected, reason, shielded: [platformId...], contribution }（lock §D）。
 * @param {{platformId: String, numericUserId: Number, eventId: Number}} param0
 */
exports.healerShield = async ({ platformId, numericUserId, eventId }) => {
  const result = { rejected: false, reason: null, shielded: [], contribution: 0 };

  const active = await WorldBossEvent.getActive();
  if (!active || active.id !== eventId) {
    result.rejected = true;
    result.reason = "not_active";
    return result;
  }

  const bonuses = await EquipmentService.getEquipmentBonuses(platformId);
  const k = WorldBossConfig.getShieldCountK() + (bonuses.support_power || 0);
  const minutes = WorldBossConfig.getNaturalRecoveryMinutes();
  const ttlSec = minutes * 60;

  const recent = (await WorldBossLog.getRecentAttackers({ eventId, minutes, limit: k })).slice(
    0,
    k
  );
  for (const row of recent) {
    // getRecentAttackers rows carry platform_id; pool/shield identity is platform_id (lock §B/§E).
    const target = row.platform_id;
    await wbRedis.shieldSet(eventId, target, platformId, ttlSec);
    result.shielded.push(target);
  }

  // D22 participation row. Absorb credit is back-written to the OWNER by M4's enrage handler.
  await WorldBossLog.createWithRole({
    user_id: numericUserId, // numeric user.id of the healer
    world_boss_event_id: eventId,
    role: "healer",
    action_type: "shield",
    damage: 0,
    cost: WorldBossConfig.getNormalAttackCost(),
    contribution: 0,
  });

  return result;
};

exports.healerRevive = async ({ platformId, numericUserId, eventId }) => {
  const result = { rejected: false, reason: null, revived: [], contribution: 0 };

  const active = await WorldBossEvent.getActive();
  if (!active || active.id !== eventId) {
    result.rejected = true;
    result.reason = "not_active";
    return result;
  }

  const bonuses = await EquipmentService.getEquipmentBonuses(platformId);
  const k = WorldBossConfig.getReviveCountK() + (bonuses.support_power || 0);

  // poolPopMin returns platform_id strings ([] when empty); pool identity is platform_id (lock §B).
  const revived = await wbRedis.poolPopMin(eventId, k);
  result.revived = revived;
  result.contribution = revived.length; // contribution = ACTUAL popped count (resolve-time, addendum §11)

  // D22: attempted action always costs + writes a row, even when it revived nobody.
  await WorldBossLog.createWithRole({
    user_id: numericUserId, // numeric user.id of the healer (caller-resolved via UserModel.getId)
    world_boss_event_id: eventId,
    role: "healer",
    action_type: "revive",
    damage: 0,
    cost: WorldBossConfig.getNormalAttackCost(),
    contribution: revived.length,
  });

  return result;
};
