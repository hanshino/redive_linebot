// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

const CATEGORY_KEY = "chat";

const ACHIEVEMENTS = [
  {
    key: "prestige_departure",
    name: "啟程",
    description: "通過 ★1 啟程試煉,踏上轉生之路",
    icon: "🌱",
    type: "milestone",
    rarity: 1,
    target_value: 1,
    reward_stones: 100,
    order: 10,
    notify_on_unlock: true,
    notify_message: "恭喜踏上轉生之路！\n已解鎖成就：{icon} {name}",
  },
  {
    key: "prestige_awakening",
    name: "覺醒",
    description: "通過 ★5 覺悟試煉,達成覺醒終態",
    icon: "✨",
    type: "milestone",
    rarity: 3,
    target_value: 1,
    reward_stones: 500,
    order: 11,
    notify_on_unlock: true,
    notify_message: "覺醒者誕生！\n已解鎖成就：{icon} {name}",
  },
  {
    key: "prestige_pioneer",
    name: "先驅者",
    description: "舊說話等級系統 Lv.100+ 的先驅玩家",
    icon: "🏛️",
    type: "hidden",
    rarity: 3,
    target_value: 1,
    reward_stones: 500,
    order: 12,
    notify_on_unlock: true,
    notify_message: "感謝同行！\n已解鎖成就：{icon} {name}",
  },
  {
    key: "legacy_lv80",
    name: "資深旅人",
    description: "舊說話等級系統 Lv.80+ 的資深玩家",
    icon: "⚔️",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 300,
    order: 13,
    notify_on_unlock: true,
    notify_message: "感謝同行！\n已解鎖成就：{icon} {name}",
  },
  {
    key: "legacy_lv50",
    name: "百戰見習",
    description: "舊說話等級系統 Lv.50+ 的中堅玩家",
    icon: "🛡️",
    type: "hidden",
    rarity: 1,
    target_value: 1,
    reward_stones: 150,
    order: 14,
    notify_on_unlock: true,
    notify_message: "感謝同行！\n已解鎖成就：{icon} {name}",
  },
  {
    key: "blessing_breeze",
    name: "疾風之道",
    description: "覺醒時擁有「迅雷語速」與「燃燒餘熱」兩項冷卻祝福",
    icon: "🌬️",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 200,
    order: 15,
    notify_on_unlock: true,
    notify_message: "已解鎖隱藏 build 成就：{icon} {name}",
  },
  {
    key: "blessing_torrent",
    name: "洪流之道",
    description: "覺醒時擁有「絮語之心」與「節律之泉」兩項遞減祝福",
    icon: "🌊",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 200,
    order: 16,
    notify_on_unlock: true,
    notify_message: "已解鎖隱藏 build 成就:{icon} {name}",
  },
  {
    key: "blessing_temperature",
    name: "溫度兼融",
    description: "覺醒時同時擁有「群星加護」與「溫室之語」",
    icon: "🌡️",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 200,
    order: 17,
    notify_on_unlock: true,
    notify_message: "已解鎖隱藏 build 成就:{icon} {name}",
  },
  {
    key: "blessing_solitude",
    name: "孤獨之道",
    description: "覺醒時未選取「群星加護」祝福",
    icon: "🏝️",
    type: "hidden",
    rarity: 2,
    target_value: 1,
    reward_stones: 200,
    order: 18,
    notify_on_unlock: true,
    notify_message: "已解鎖隱藏 build 成就:{icon} {name}",
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
  const rows = ACHIEVEMENTS.map(a => ({ ...a, category_id: category.id }));
  await knex("achievements").insert(rows);
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex("achievements")
    .whereIn(
      "key",
      ACHIEVEMENTS.map(a => a.key)
    )
    .del();
};
