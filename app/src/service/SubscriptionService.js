const i18n = require("../util/i18n");
const SubscribeUser = require("../model/application/SubscribeUser");
const SubscribeCard = require("../model/application/SubscribeCard");
const { DefaultLogger } = require("../util/Logger");

// Effect types that represent a feature unlock (binary perk) rather than a
// numeric bonus. Rendered without a "+N" suffix since the value is always 1.
// auto_janken_match = Plus 專屬「每日自動配對猜拳」展示用 effect，只有開關無數值。
const FEATURE_EFFECT_TYPES = new Set(["auto_daily_gacha", "auto_janken_fate", "auto_janken_match"]);

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

/**
 * 篩出某玩家「當下有效」的訂閱列，並依 SubscribeCard.SUPERSEDED_BY 標記被覆蓋者。
 * 有效邊界與 SubscribeUser.hasActiveAutoMatchAt 一致：start_at <= now < end_at。
 * 被覆蓋的卡（例如持有中 month_plus 時的 month）daily_ration / gacha_times 不發不計，
 * 但仍照常倒數（本函式不動 end_at），故回傳時原樣保留 end_at，只加註 paused 資訊。
 * season 目前沒有任何 SUPERSEDED_BY 條目，永遠不會被標記 paused（與 Plus 疊加，舊承諾）。
 *
 * @param {Array<{subscribe_card_key: String, start_at: Date|String, end_at: Date|String}>} rows
 * @param {Date|String|Number} now
 * @returns {Array<Object>} 每列原樣保留輸入欄位，並附加：
 *   - paused {Boolean} 是否被覆蓋
 *   - supersededByEndAt {Date|null} 覆蓋它的那張卡的 end_at（paused=false 時為 null）
 */
function resolveActive(rows, now) {
  const ts = new Date(now).getTime();
  const active = (rows || []).filter(row => {
    const start = new Date(row.start_at).getTime();
    const end = new Date(row.end_at).getTime();
    return start <= ts && ts < end;
  });

  return active.map(row => {
    const overriddenByKeys = SubscribeCard.SUPERSEDED_BY[row.subscribe_card_key];
    const overriders = overriddenByKeys
      ? active.filter(other => overriddenByKeys.includes(other.subscribe_card_key))
      : [];

    if (overriders.length === 0) {
      return { ...row, paused: false, supersededByEndAt: null };
    }

    const supersededByEndAt = overriders.reduce((latest, other) => {
      const end = new Date(other.end_at);
      return !latest || end > latest ? end : latest;
    }, null);

    return { ...row, paused: true, supersededByEndAt };
  });
}

/**
 * 期中升級折算的核心數學：某段時間長度（ms）依兩卡單價比例換算成另一張卡的時間長度。
 * 見 docs/plans/2026-09-09-sponsorship-subscription-roadmap.md §5「2026-09-23 Plus 售價與折算決策」：
 * 比例 = 被折算卡單價 ÷ 目標卡單價，精確到毫秒，不進位。
 * 純函式、fail closed：durationMs/fromPrice/toPrice 任一非正數就回傳 0（不平白送出時間），
 * 對應「月卡恰好到期／已過期不折算」的邊界。
 * @param {Number} durationMs 被折算的時間長度（ms）
 * @param {Number} fromPrice 被折算卡種的單價
 * @param {Number} toPrice 目標卡種的單價
 * @returns {Number} 換算後加到目標卡的毫秒數
 */
function convertDurationByPrice(durationMs, fromPrice, toPrice) {
  const from = Number(fromPrice);
  const to = Number(toPrice);
  if (!(durationMs > 0) || !(from > 0) || !(to > 0)) return 0;
  return durationMs * (from / to);
}

/**
 * 依 SubscribeCard.SUPERSEDED_BY 反查：哪些卡種持有中會被 key 覆蓋／折算吸收。
 * 例：keysSupersededBy("month_plus") → ["month"]；keysSupersededBy("season") → []
 * （season 從未出現在 SUPERSEDED_BY 的 value 裡，不參與折算）。
 * 對 SubscribeCard.SUPERSEDED_BY 缺失（例如測試 mock 只定義部分欄位）fail closed 回傳 []。
 * @param {String} key
 * @returns {Array<String>}
 */
function keysSupersededBy(key) {
  const table = SubscribeCard.SUPERSEDED_BY || {};
  return Object.keys(table).filter(k => table[k].includes(key));
}

/**
 * 依 SubscribeCard.SUPERSEDED_BY 正查：哪些卡種持有中會覆蓋 key（key 因而被折算吸收）。
 * 例：supersedingKeysOf("month") → ["month_plus"]；supersedingKeysOf("season") → []。
 * 同樣對缺失的 SUPERSEDED_BY fail closed 回傳 []。
 * @param {String} key
 * @returns {Array<String>}
 */
function supersedingKeysOf(key) {
  return (SubscribeCard.SUPERSEDED_BY || {})[key] || [];
}

module.exports = {
  hasEffect,
  formatEffectRow,
  resolveActive,
  convertDurationByPrice,
  keysSupersededBy,
  supersedingKeysOf,
};
