const { getClient } = require("bottender");
const mysql = require("../util/mysql");
const lineUtil = require("../util/line");
const { DefaultLogger } = require("../util/Logger");

const LineClient = getClient("line");

const DEFAULT_TEMPLATE_WITH_REWARD = "🎉 {user} 解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石";
const DEFAULT_TEMPLATE_NO_REWARD = "🎉 {user} 解鎖成就「{icon} {name}」！";
const FALLBACK_NAME = "玩家";

// DB covers senders populated by setProfile middleware. Mentionees (sister
// achievements) often have no user row yet — fall back to LINE profile APIs
// so {user} renders with the real display name instead of "玩家".
async function getDisplayName(userId, context) {
  try {
    const row = await mysql("user").where({ platform_id: userId }).select("display_name").first();
    if (row && row.display_name) return row.display_name;
  } catch (err) {
    DefaultLogger.warn("achievementNotifier.getDisplayName db lookup failed:", err);
  }

  const groupId = context && context.event && context.event.source && context.event.source.groupId;
  if (groupId) {
    try {
      const profile = await lineUtil.getGroupMemberProfile(groupId, userId);
      if (profile && profile.displayName) return profile.displayName;
    } catch (err) {
      DefaultLogger.warn("achievementNotifier.getDisplayName group-member lookup failed:", err);
    }
  }

  try {
    const profile = await LineClient.getUserProfile(userId);
    if (profile && profile.displayName) return profile.displayName;
  } catch (err) {
    DefaultLogger.warn("achievementNotifier.getDisplayName user-profile lookup failed:", err);
  }

  return FALLBACK_NAME;
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
    const userName = await getDisplayName(userId, context);
    for (const a of toNotify) {
      await context.replyText(renderTemplate(a, userName));
    }
  } catch (err) {
    DefaultLogger.error("achievementNotifier.notifyUnlocks error:", err);
  }
}

module.exports = { notifyUnlocks, renderTemplate, getDisplayName };
