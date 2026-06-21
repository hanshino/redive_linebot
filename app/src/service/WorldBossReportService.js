const redis = require("../util/redis");
const { reportUnreadKey } = require("../util/worldBossRedis");
const WorldBossRewardLog = require("../model/application/WorldBossRewardLog");

const UNREAD_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d; report waits for the player's next interaction

// SOLE setter of the report-unread flag (M7 settlement calls this — never a raw redis.set elsewhere).
exports.setUnread = async platformId => {
  await redis.set(reportUnreadKey(platformId), "1", { EX: UNREAD_TTL_SECONDS });
};

const BOARD_LABELS = { dps: "輸出榜", healer: "治療榜", tank: "格擋榜", none: "參戰" };

const buildCard = reward => {
  const boardLabel = BOARD_LABELS[reward.board] || "參戰";
  const rankLine = reward.rank ? `第 ${reward.rank} 名` : "參戰獎勵";
  const bodyContents = [
    { type: "text", text: "世界王戰報", weight: "bold", size: "lg" },
    { type: "text", text: `${boardLabel}・${rankLine}`, size: "sm", color: "#888888" },
    { type: "separator", margin: "md" },
    { type: "text", text: `強化素材 x${reward.materials}`, margin: "md" },
  ];
  if (reward.stones > 0) {
    bodyContents.push({ type: "text", text: `女神石 x${reward.stones}` });
  }
  if (reward.is_mvp) {
    bodyContents.push({
      type: "text",
      text: "★ MVP ★",
      weight: "bold",
      color: "#d4af37",
      margin: "md",
    });
  }
  return {
    type: "bubble",
    body: { type: "box", layout: "vertical", contents: bodyContents },
  };
};

exports.getUnreadReport = async platformId => {
  const flag = await redis.get(reportUnreadKey(platformId));
  if (!flag) {
    return { hasReport: false, reward: null, card: null };
  }
  const reward = await WorldBossRewardLog.getUnreadForUser(platformId);
  if (!reward) {
    return { hasReport: false, reward: null, card: null };
  }
  return { hasReport: true, reward, card: buildCard(reward) };
};

exports.markDelivered = async platformId => {
  await redis.del(reportUnreadKey(platformId));
};
