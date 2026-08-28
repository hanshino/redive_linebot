const { pick } = require("lodash");

/**
 * Public projections for achievement rows.
 *
 * `achievements` rows carry fields that must never reach a client:
 *   - `condition`       unlock rules, secret thresholds, eligibility user lists
 *   - `notify_message`  wording that can reveal how an achievement is earned
 *   - `notify_on_unlock` internal delivery flag
 *   - `category_id`, `created_at`, `updated_at` internal bookkeeping
 *
 * Players datamine this codebase, so anything shipped to the browser is public.
 * These projections are allowlists, not blocklists: a column added to the table
 * later stays private by default instead of silently leaking on the next deploy.
 *
 * Internal consumers (achievementNotifier needs `notify_message` /
 * `notify_on_unlock`) keep using the raw rows and must NOT go through here.
 */

// Everything the achievement browser legitimately renders.
const PUBLIC_FIELDS = [
  "id",
  "key",
  "name",
  "icon",
  "type",
  "rarity",
  "target_value",
  "reward_stones",
  "order",
  "category_key",
  "category_name",
  "category_icon",
];

// Composite/joined fields assembled by the callers on top of a base row.
const DERIVED_FIELDS = [
  "isUnlocked",
  "currentValue",
  "unlockedAt",
  "unlocked_at",
  "current_value",
  "percentage",
];

// A freshly unlocked achievement only needs enough to render a toast.
const UNLOCK_NOTICE_FIELDS = [
  "id",
  "key",
  "name",
  "icon",
  "rarity",
  "reward_stones",
  "category_key",
];

const toPublic = (achievement, options = {}) => {
  if (!achievement) return achievement;
  const { includeDescription = false } = options;
  return pick(achievement, [
    ...PUBLIC_FIELDS,
    ...DERIVED_FIELDS,
    ...(includeDescription ? ["description"] : []),
  ]);
};

const toPublicList = (rows, options) =>
  Array.isArray(rows) ? rows.map(row => toPublic(row, options)) : [];

/**
 * Shape used when telling a client "you just unlocked this".
 * Deliberately narrower than toPublic — no description/target_value, since the
 * unlock toast does not need the criteria and they may be secret.
 */
const toUnlockNotice = achievement =>
  achievement ? pick(achievement, UNLOCK_NOTICE_FIELDS) : achievement;

const toUnlockNoticeList = rows => (Array.isArray(rows) ? rows.map(toUnlockNotice) : []);

module.exports = {
  PUBLIC_FIELDS,
  UNLOCK_NOTICE_FIELDS,
  toPublic,
  toPublicList,
  toUnlockNotice,
  toUnlockNoticeList,
};
