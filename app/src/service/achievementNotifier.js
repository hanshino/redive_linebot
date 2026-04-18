const { getClient } = require("bottender");
const { get } = require("lodash");
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
async function _getDisplayName(userId, context) {
  const lookups = [
    async () => mysql("user").where({ platform_id: userId }).select("display_name").first(),
    async () => {
      const groupId = get(context, "event.source.groupId");
      return groupId ? lineUtil.getGroupMemberProfile(groupId, userId) : null;
    },
    async () => LineClient.getUserProfile(userId),
  ];
  for (const lookup of lookups) {
    const row = await lookup().catch(() => null);
    const name = row && (row.display_name || row.displayName);
    if (name) return name;
  }
  DefaultLogger.warn(`achievementNotifier: no display name for ${userId}, falling back to 玩家`);
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
    const userName = await _getDisplayName(userId, context);
    for (const a of toNotify) {
      await context.replyText(renderTemplate(a, userName));
    }
  } catch (err) {
    DefaultLogger.error("achievementNotifier.notifyUnlocks error:", err);
  }
}

module.exports = { notifyUnlocks, renderTemplate, _getDisplayName };
