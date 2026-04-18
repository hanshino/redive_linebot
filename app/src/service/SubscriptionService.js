const i18n = require("../util/i18n");
const SubscribeUser = require("../model/application/SubscribeUser");
const SubscribeCard = require("../model/application/SubscribeCard");
const { DefaultLogger } = require("../util/Logger");

// Effect types that represent a feature unlock (binary perk) rather than a
// numeric bonus. Rendered without a "+N" suffix since the value is always 1.
const FEATURE_EFFECT_TYPES = new Set(["auto_daily_gacha", "auto_janken_fate"]);

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

/**
 * Render a subscribe card effect as a single localized display row.
 * Feature-unlock effects omit the numeric "+value" suffix.
 * @param {{type: string, value: number|boolean}} effect
 * @returns {string}
 */
function formatEffectRow(effect) {
  const type = i18n.__(`message.subscribe.effects.${effect.type}`);
  if (FEATURE_EFFECT_TYPES.has(effect.type)) {
    return i18n.__("message.subscribe.effects_row_feature", { type });
  }
  return i18n.__("message.subscribe.effects_row_positive", {
    type,
    value: effect.value,
  });
}

module.exports = {
  hasEffect,
  formatEffectRow,
};
