const config = require("config");
const WorldBossEvent = require("../model/application/WorldBossEvent");
const settlement = require("./WorldBossSettlementService");

const EVENT_WINDOW_HOURS = 24;

/**
 * 每日自動開一隻全服共王（D12）。只在設定的 worldboss.open_hour 開，且最多一隻。
 * 以「年度第幾天」對 worldboss.boss_pool 取模做輪替，達成每日換王的圖鑑感（D25）。
 * cron 為每分鐘且 immediate:true，故必須用 getActive() 守門，避免同一小時內重複開。
 * @returns {Promise<Number|null>} 新事件 id；非開王時段 / 已有進行中事件 / 王池為空時回傳 null
 */
exports.createDailyBoss = async () => {
  const now = new Date();
  if (now.getHours() !== config.get("worldboss.open_hour")) {
    return null;
  }

  const active = await WorldBossEvent.getActive();
  if (active) {
    return null;
  }

  const pool = config.get("worldboss.boss_pool");
  if (!Array.isArray(pool) || pool.length === 0) {
    return null;
  }

  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (24 * 60 * 60 * 1000));
  const worldBossId = pool[dayOfYear % pool.length];

  const startTime = now;
  const endTime = new Date(now.getTime() + EVENT_WINDOW_HOURS * 60 * 60 * 1000);

  const [eventId] = await WorldBossEvent.create({
    world_boss_id: worldBossId,
    status: "active",
    start_time: startTime,
    end_time: endTime,
  });

  return eventId || null;
};

/**
 * 每分鐘生命週期掃描（對齊 RaceAdvance）。只做兩件事，符合「cron 不打人、不推播」：
 *   1. 撈 status='killed' AND settled_at IS NULL → 交給 settleEvent 發擊殺獎（致命刀已在 M4 做過
 *      active→killed CAS，故此處不再 CAS，直接結算；settleEvent 以 settled_at 做冪等守衛）。
 *   2. 撈 status='active' AND end_time<now → casStatus(active→expired, {}) 原子過期；贏得轉移者才
 *      呼叫 settleEvent 發參與獎。extra={}：settled_at 由 settleEvent 寫、killed_at 對逾時王維持 NULL。
 * 單筆結算失敗不中斷整批（下一分鐘重試；settleEvent 冪等）。
 * @returns {Promise<{settledKilled: Number, expired: Number}>}
 */
exports.advance = async () => {
  let settledKilled = 0;
  let expired = 0;

  const killed = await WorldBossEvent.getKilledUnsettled();
  for (const event of killed) {
    try {
      await settlement.settleEvent(event.id);
      settledKilled += 1;
    } catch (err) {
      console.error(`[WorldBoss] settle killed event #${event.id} failed:`, err);
    }
  }

  const overdue = await WorldBossEvent.getOverdueActive();
  for (const event of overdue) {
    try {
      const won = await WorldBossEvent.casStatus(event.id, "active", "expired", {});
      if (!won) {
        continue;
      }
      await settlement.settleEvent(event.id);
      expired += 1;
    } catch (err) {
      console.error(`[WorldBoss] expire+settle event #${event.id} failed:`, err);
    }
  }

  return { settledKilled, expired };
};
