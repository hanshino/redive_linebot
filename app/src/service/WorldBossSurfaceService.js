const WorldBossBroadcastService = require("./WorldBossBroadcastService");
const WorldBossReportService = require("./WorldBossReportService");

exports.buildStatusText = async eventId => {
  const snap = await WorldBossBroadcastService.buildSnapshot(eventId);
  const phaseLabel = snap.phase === "enrage" ? "暴怒" : "平穩";
  const dpsTop = snap.boards.dps[0] ? snap.boards.dps[0].total_damage : 0;
  const healerTop = snap.boards.healer[0] ? snap.boards.healer[0].total_contribution : 0;
  const tankTop = snap.boards.tank[0] ? snap.boards.tank[0].total_contribution : 0;
  return [
    `世界王狀態：${phaseLabel}`,
    `剩餘血量：${snap.hpPct}%`,
    `輸出榜首：${dpsTop}`,
    `治療榜首：${healerTop}`,
    `格擋榜首：${tankTop}`,
  ].join("\n");
};

// Decide how the combat result is surfaced to the group (GC#3).
// immediate: personal-status rejections AND the one-time-per-event enrage announce.
// batch: an ordinary landed hit (goes into the 5-min handleKeepingMessage buffer; M9 flushes via reply token).
exports.classifyReply = combatResult => {
  if (combatResult.rejected) {
    return { mode: "immediate", reason: combatResult.reason };
  }
  if (combatResult.didEnrageTrigger) {
    return { mode: "immediate", reason: "enrage_trigger" };
  }
  return { mode: "batch", reason: null };
};

// Surface the battle-report card via the provided reply function.
// Clears the unread flag ONLY after the reply succeeds (GC#3 / D11).
exports.surfaceReportCard = async (platformId, replyFn) => {
  const report = await WorldBossReportService.getUnreadReport(platformId);
  if (!report.hasReport || !report.card) return false;
  try {
    await replyFn(report.card);
  } catch {
    return false; // do not clear; the player will see it on the next interaction
  }
  await WorldBossReportService.markDelivered(platformId);
  return true;
};
