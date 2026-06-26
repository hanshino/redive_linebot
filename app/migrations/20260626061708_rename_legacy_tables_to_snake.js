/**
 * 把殘留的 PascalCase legacy 表名統一成 snake_case（表名專用，欄位名不動）。
 *
 * 對應 PR：snake_case 表名統一。User 已於更早 migration 改名為 user，不在此列。
 * 安全性：
 *   - RENAME TABLE 為 metadata-only、毫秒級、不複製資料；這批表無 FK / trigger 牽連（已查 prod）。
 *   - hasTable 守衛 → prod（camelCase 存在）會改名；fresh DB / 已改名環境為 no-op，冪等。
 *   - 需與「改用新表名的應用程式碼」同一次 release 上線。
 *
 * ponytail: 假設 lower_case_table_names=0（prod 與 docker mysql 皆是，故大小寫敏感、改名有意義）。
 */
const RENAMES = [
  ["Admin", "admin"],
  ["CustomerOrder", "customer_order"],
  ["GachaPool", "gacha_pool"],
  ["GlobalOrders", "global_orders"],
  ["Guild", "guild"],
  ["GuildBattleConfig", "guild_battle_config"],
  ["GuildBattleFinish", "guild_battle_finish"],
  ["GuildConfig", "guild_config"],
  ["GuildMembers", "guild_members"],
  ["Inventory", "inventory"],
  ["MessageRecord", "message_record"],
  ["PrincessUID", "princess_uid"],
  ["TotalEventTimes", "total_event_times"],
];

exports.up = async function (knex) {
  for (const [from, to] of RENAMES) {
    if ((await knex.schema.hasTable(from)) && !(await knex.schema.hasTable(to))) {
      await knex.schema.renameTable(from, to);
    }
  }
};

exports.down = async function (knex) {
  for (const [from, to] of RENAMES) {
    if ((await knex.schema.hasTable(to)) && !(await knex.schema.hasTable(from))) {
      await knex.schema.renameTable(to, from);
    }
  }
};
