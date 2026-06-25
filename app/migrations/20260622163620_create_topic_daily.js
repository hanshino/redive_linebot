// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * topic_daily — 聊天用字分布的核心日聚合表（見 docs/plans/2026-06-22-topic-heat-keywords-concept.md）。
 * 粒度 (group_id, user_id, stat_date, keyword)，所有視圖用 GROUP BY 推導：
 *   個人雲     → WHERE user_id=? AND stat_date in 範圍 GROUP BY keyword
 *   群組雲/熱門 → WHERE group_id=? ... GROUP BY keyword，人數 COUNT(DISTINCT user_id)
 * keyword 為斷詞 + 別名正規化後的 canonical；同則訊息去重後才累加 message_count。
 *
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("topic_daily", table => {
    table.bigIncrements("id").primary();
    table.string("group_id", 33).notNullable();
    table.string("user_id", 33).notNullable();
    table.date("stat_date").notNullable().comment("UTC+8 日界線");
    table.string("keyword", 64).notNullable().comment("正規化後的 canonical keyword");
    table
      .integer("message_count")
      .unsigned()
      .notNullable()
      .defaultTo(0)
      .comment("該詞當日於該群該人出現的訊息數（同則去重）");
    table.timestamps(true, true);

    table.unique(["group_id", "user_id", "stat_date", "keyword"], "uq_group_user_date_keyword");
    table.index(["user_id", "stat_date"], "idx_user_date"); // 個人雲
    table.index(["group_id", "stat_date"], "idx_group_date"); // 群組雲 / 熱門
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("topic_daily");
};
