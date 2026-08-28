// The five hidden achievements intentionally omit `condition` here. The
// thresholds are kept only in production so this migration can restore the
// non-sensitive schema without exposing the unlock rules in git. Consequently
// those five achievements exist on a fresh database but cannot unlock there.

const CATEGORIES = [
  { key: "race", name: "賽跑", icon: "🏇", order: 6 },
  { key: "market", name: "市集", icon: "🏪", order: 7 },
];

const ACHIEVEMENTS = [
  {
    category: "race",
    key: "race_first_bet",
    name: "初次下注",
    description: "第一次在賽跑中下注",
    icon: "🎫",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 1,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "race",
    key: "race_win_10",
    name: "看眼識馬",
    description: "累計猜中賽跑 10 次",
    icon: "🐎",
    type: "milestone",
    rarity: 1,
    target_value: 10,
    reward_stones: 200,
    order: 2,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "race",
    key: "race_all_in",
    name: "孤注一擲",
    description: "在賽跑中押上全部身家下注",
    icon: "🎰",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 300,
    order: 3,
    notify_on_unlock: true,
    notify_message: "🎉 {user} 孤注一擲，解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石",
  },
  {
    category: "race",
    key: "race_big_win",
    name: "以小博大",
    description: "賽跑下注獲勝且賠率達到高倍數",
    icon: "💰",
    type: "hidden",
    rarity: 3,
    target_value: 1,
    reward_stones: 500,
    order: 4,
    notify_on_unlock: true,
    notify_message:
      "🎉 {user} 以小博大命中高賠率，解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石",
  },
  {
    category: "market",
    key: "trade_first",
    name: "初次交易",
    description: "第一次完成交易市場交易",
    icon: "🤝",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 1,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "market",
    key: "trade_50",
    name: "交易大亨",
    description: "累計完成交易 50 次",
    icon: "💼",
    type: "milestone",
    rarity: 1,
    target_value: 50,
    reward_stones: 200,
    order: 2,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "market",
    key: "atm_whale",
    name: "一擲千金",
    description: "單次轉帳金額達到指定門檻",
    icon: "🐋",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 300,
    order: 3,
    notify_on_unlock: true,
    notify_message: "🎉 {user} 一擲千金，解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石",
  },
  {
    category: "market",
    key: "coupon_first",
    name: "序號獵人",
    description: "第一次兌換優惠券",
    icon: "🎟️",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 4,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "market",
    key: "coupon_collector",
    name: "優惠達人",
    description: "累計兌換優惠券 10 次",
    icon: "🎁",
    type: "milestone",
    rarity: 1,
    target_value: 10,
    reward_stones: 200,
    order: 5,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "market",
    key: "shop_first_exchange",
    name: "首次兌換",
    description: "第一次在女神石商店兌換商品",
    icon: "🛍️",
    type: "milestone",
    rarity: 0,
    target_value: 1,
    reward_stones: 30,
    order: 6,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "market",
    key: "shop_big_spender",
    name: "課金戰士",
    description: "單次兌換消耗大量女神石",
    icon: "💎",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 300,
    order: 7,
    notify_on_unlock: true,
    notify_message: "🎉 {user} 揮金如土，解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石",
  },
  {
    category: "chat",
    key: "prestige_first",
    name: "轉生初體驗",
    description: "完成第一次轉生",
    icon: "🔄",
    type: "milestone",
    rarity: 1,
    target_value: 1,
    reward_stones: 100,
    order: 19,
    notify_on_unlock: false,
    notify_message: null,
  },
  {
    category: "chat",
    key: "prestige_3",
    name: "三生三世",
    description: "累計完成 3 次轉生",
    icon: "♻️",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 300,
    order: 20,
    notify_on_unlock: true,
    notify_message: "🎉 {user} 歷經三世輪迴，解鎖成就「{icon} {name}」！獲得 {reward} 顆女神石",
  },
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex("achievement_categories").insert(CATEGORIES).onConflict("key").ignore();

  const categories = await knex("achievement_categories").select("id", "key");
  const categoryMap = {};
  categories.forEach(category => {
    categoryMap[category.key] = category.id;
  });

  // `onConflict().ignore()` compiles to INSERT IGNORE on MySQL, which swallows
  // every error rather than just the duplicate key -- a missing category would
  // silently drop rows instead of failing. Fail loudly first, like
  // 20260424154256_seed_prestige_achievements.js does.
  const achievements = ACHIEVEMENTS.map(({ category, ...rest }) => {
    const categoryId = categoryMap[category];
    if (!categoryId) {
      throw new Error(`achievement_categories row with key='${category}' not found`);
    }
    return { ...rest, category_id: categoryId };
  });
  await knex("achievements").insert(achievements).onConflict("key").ignore();
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // This removes rows by key, including production rows if rolled back there.
  await knex("achievements")
    .whereIn(
      "key",
      ACHIEVEMENTS.map(achievement => achievement.key)
    )
    .del();
  await knex("achievement_categories")
    .whereIn(
      "key",
      CATEGORIES.map(category => category.key)
    )
    .del();
};
