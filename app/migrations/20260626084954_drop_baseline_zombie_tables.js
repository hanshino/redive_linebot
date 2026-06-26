/**
 * 清掉 baseline（20210101000000）在 prod 晚跑時用 `CREATE TABLE IF NOT EXISTS`
 * 復活的 10 張空殭屍表。
 *
 * 成因：baseline 忠實重現原 Princess.sql 的 26 張表，但其中 10 張早已被後續
 * migration drop / rename（且那些 migration 在 prod 已套用、不會再跑）。
 * 在 lower_case_table_names=0 的 prod 上，IF NOT EXISTS 對不上現況 → 重建成空表。
 * （全新環境不受影響：drop/rename migration 會在 baseline 之後重新清掉它們。）
 *
 * 安全性：每張表「存在且 0 列」才 drop；若意外有資料則 throw 中止（不誤刪）。
 * 這道 0 列防呆也能擋住萬一某環境 lctn≠0 導致 "User" 撞到 live 的 "user"（會有列數 → 中止）。
 */
const ZOMBIE_TABLES = [
  "User", // batch 38 已改名為 user（live，2.7 萬列）；此處只清空殼 User
  "GachaSignin",
  "chat_level_title",
  "chat_range_title",
  "BulletIn",
  "sent_bulletin",
  "notify_list",
  "subscribe_type",
  "arena_records",
  "arena_like_records",
];

exports.up = async function (knex) {
  for (const table of ZOMBIE_TABLES) {
    if (!(await knex.schema.hasTable(table))) continue;
    const [{ cnt }] = await knex(table).count({ cnt: "*" });
    if (Number(cnt) > 0) {
      throw new Error(
        `Refusing to drop "${table}": expected 0 rows but found ${cnt}. Investigate before re-running.`
      );
    }
    await knex.schema.dropTableIfExists(table);
  }
};

// 不重建殭屍表（它們本就該不存在）。
exports.down = async function () {};
