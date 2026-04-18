// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const CATEGORY_KEY = "social";

const ROWS = [
  {
    key: "mention_admin_hi_self",
    name: "鬆餅教教主",
    description: "信徒的祝福匯聚成你的光環",
    icon: "🥞",
    order: 120,
    includeUserId: "U41b31c07a3279ca64355d2de43101b3d",
    keywords: ["鬆餅", "祝福"],
    notify_message:
      "信徒的呼喚匯聚成祝福，你已成為鬆餅教的精神象徵。\n已解鎖隱藏成就：{icon} {name}",
  },
  {
    key: "mention_memory_seeker_self",
    name: "布丁古神的意識",
    description: "無數旅人觸碰了你的意識",
    icon: "🍮",
    order: 121,
    includeUserId: "U80ca6f24809c9a00981562b771fb6b84",
    keywords: [],
    notify_message: "無數旅人觸碰了你的意識，古神終於完整甦醒。\n已解鎖隱藏成就：{icon} {name}",
  },
  {
    key: "mention_void_gazer_self",
    name: "深淵本體",
    description: "你就是虛無本身",
    icon: "👁️",
    order: 122,
    includeUserId: "Uc28b2e002c86886fffdb6cabea060c6e",
    keywords: ["sudo su"],
    notify_message:
      "$ cat /etc/shadow\n[INFO] you are the void now.\n無數窺探者在你的凝視下沉默。\n已解鎖隱藏成就：{icon} {name}",
  },
];

/**
 * @param {Knex} knex
 */
exports.up = async function (knex) {
  const category = await knex("achievement_categories").where({ key: CATEGORY_KEY }).first();
  if (!category) {
    throw new Error(`achievement_categories row with key='${CATEGORY_KEY}' not found`);
  }

  for (const r of ROWS) {
    await knex("achievements").insert({
      category_id: category.id,
      key: r.key,
      name: r.name,
      description: r.description,
      icon: r.icon,
      type: "hidden",
      rarity: 3,
      target_value: 10,
      reward_stones: 300,
      order: r.order,
      condition: JSON.stringify({
        keywords: r.keywords,
        eligibility: { includeUserIds: [r.includeUserId] },
      }),
      notify_on_unlock: true,
      notify_message: r.notify_message,
    });
  }
};

/**
 * @param {Knex} knex
 */
exports.down = async function (knex) {
  await knex("achievements")
    .whereIn(
      "key",
      ROWS.map(r => r.key)
    )
    .del();
};
