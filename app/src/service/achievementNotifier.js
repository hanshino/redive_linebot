const mysql = require("../util/mysql");
const { DefaultLogger } = require("../util/Logger");

const DEFAULT_TEMPLATE_WITH_REWARD = "🎉 {user} 解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石";
const DEFAULT_TEMPLATE_NO_REWARD = "🎉 {user} 解鎖成就「{icon} {name}」！";
const FALLBACK_NAME = "玩家";

async function getDisplayName(userId) {
  const row = await mysql("user").where({ platform_id: userId }).select("display_name").first();
  return (row && row.display_name) || FALLBACK_NAME;
}

function renderTemplate(achievement, userName) {
  const fallback =
    achievement.reward_stones > 0 ? DEFAULT_TEMPLATE_WITH_REWARD : DEFAULT_TEMPLATE_NO_REWARD;
  const tpl = achievement.notify_message || fallback;
  return tpl
    .replace(/\{user\}/g, userName)
    .replace(/\{name\}/g, achievement.name)
    .replace(/\{icon\}/g, achievement.icon)
    .replace(/\{reward\}/g, String(achievement.reward_stones));
}

async function notifyUnlocks(context, userId, achievements) {
  try {
    const toNotify = (achievements || []).filter(a => a && a.notify_on_unlock);
    if (!toNotify.length) return;
    const userName = await getDisplayName(userId);
    for (const a of toNotify) {
      context.replyText(renderTemplate(a, userName));
    }
  } catch (err) {
    DefaultLogger.error("achievementNotifier.notifyUnlocks error:", err);
  }
}

module.exports = { notifyUnlocks, renderTemplate };
