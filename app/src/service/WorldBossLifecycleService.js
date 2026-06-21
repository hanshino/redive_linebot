const config = require("config");
const WorldBossEvent = require("../model/application/WorldBossEvent");
require("./WorldBossSettlementService");

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
