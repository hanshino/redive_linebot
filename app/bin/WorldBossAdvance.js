const Lifecycle = require("../src/service/WorldBossLifecycleService");

/**
 * 世界王生命週期 cron（每分鐘，對齊 RaceAdvance）。
 * 只做：自動開每日王 → 結算已擊殺 / 過期未結算（不推播、不打人）。
 * 開王與結算各自獨立 try/catch，任一失敗不影響另一個、也不讓 scheduler tick 崩潰。
 * @returns {Promise<void>}
 */
module.exports = async function () {
  try {
    const eventId = await Lifecycle.createDailyBoss();
    if (eventId) {
      console.log(`[WorldBoss] Opened daily boss event #${eventId}`);
    }
  } catch (err) {
    console.error("[WorldBoss] createDailyBoss error:", err);
  }

  try {
    const { settledKilled, expired } = await Lifecycle.advance();
    if (settledKilled || expired) {
      console.log(`[WorldBoss] Advanced: settledKilled=${settledKilled} expired=${expired}`);
    }
  } catch (err) {
    console.error("[WorldBoss] advance error:", err);
  }
};
