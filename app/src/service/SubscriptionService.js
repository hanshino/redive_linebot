const SubscribeUser = require("../model/application/SubscribeUser");
const SubscribeCard = require("../model/application/SubscribeCard");
const { DefaultLogger } = require("../util/Logger");

function parseEffects(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      DefaultLogger.warn("subscription.effects.parse_error", { error: e.message });
      return [];
    }
  }
  return [];
}

/**
 * 判斷使用者目前的訂閱是否包含某個效果（effect type）。
 * 訂閱效果儲存在 subscribe_card.effects 陣列，格式為 [{type, value}, ...]。
 * 只要使用者有任一張目前有效（start_at <= now < end_at）的訂閱卡，
 * 且該卡的 effects 陣列中存在 {type: effectType, value: truthy}，就回傳 true。
 *
 * @param {string} userId LINE User ID
 * @param {string} effectType 例如 "auto_daily_gacha" / "auto_janken_fate" / "daily_ration"
 * @returns {Promise<boolean>}
 */
async function hasEffect(userId, effectType) {
  if (!userId || !effectType) return false;

  const now = new Date();
  const activeSubs = await SubscribeUser.all({
    filter: {
      user_id: userId,
      start_at: { operator: "<=", value: now },
      end_at: { operator: ">", value: now },
    },
    select: ["subscribe_card_key"],
  });

  if (!activeSubs || activeSubs.length === 0) return false;

  const seenKeys = new Set();
  for (const sub of activeSubs) {
    const key = sub && sub.subscribe_card_key;
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const card = await SubscribeCard.first({
      filter: { key },
      select: ["effects"],
    });
    if (!card) continue;

    const effects = parseEffects(card.effects);
    if (effects.some(e => e && e.type === effectType && e.value)) return true;
  }
  return false;
}

module.exports = {
  hasEffect,
};
