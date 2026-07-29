/**
 * Baseline initial schema — 收攏自原 migration/Princess.sql 的 docker init。
 *
 * 背景：以前新環境靠 docker `docker-entrypoint-initdb.d` 注入 Princess.sql 建底表，
 * 再跑 knex migration 疊上去（兩套來源）。本 migration 把那批底表收進 knex，
 * 成為單一來源；docker init 掛載與 Princess.sql 已移除。
 *
 * 安全性：
 *   - schema 句全為 `CREATE TABLE IF NOT EXISTS` → 線上既有表上跑為 no-op，零 schema 變更。
 *   - 不含任何 INSERT/TRUNCATE（原 Princess.sql 對 chat_exp_unit 等的灌種子已移除，
 *     避免在線上重跑時清掉現有資料）。資料種子交給 `app/seeds/*`，
 *     fresh bootstrap 流程為：`yarn migrate && yarn knex seed:run`。
 *   - 時間戳 20210101000000 早於最早一支既有 migration（20210728152528），
 *     確保 fresh DB 上後續 alterTable 能找到底表。
 *
 * ponytail: 直接讀同名 .sql 逐句執行，省掉把含反引號/單引號的 DDL 硬塞進 JS 字串。
 *
 * 建全新資料庫時，**不要**指定 CHARACTER SET / COLLATE（讓 MySQL 8 預設的
 * utf8mb4_0900_ai_ci 生效），或者明確指定 utf8mb4_0900_ai_ci。**不要**指定
 * utf8mb4_unicode_ci，即使這份 baseline 裡的 26 張表全部寫死 unicode_ci。
 *
 * 為什麼：`20260327_unify_all_collation_to_0900.js` 只把 10 張「舊表」
 * CONVERT TO 0900，從來不碰資料庫本身的預設 collation。正式環境沒事，
 * 是因為它的 DB 預設本來就是 0900 —— 所以這份 baseline 跑完之後才由 knex
 * 建的表（例如 user_achievements）全部繼承 0900，只有那 10 張舊表需要靠
 * 那支 migration 轉過去對齊。
 *
 * 如果建 DB 時手動指定了 unicode_ci，上面那段邏輯整個反過來：舊表被轉去
 * 0900，但後面才建的新表繼承 unicode_ci，新舊表一 JOIN 就是
 * `Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT) and
 * (utf8mb4_0900_ai_ci,IMPLICIT)`。2026-07-29 遷移到新 EC2 host 時，
 * 因為看到這份 baseline 裡的 unicode_ci 字樣就手動指定了它，
 * 結果在第 122 支 migration（grant_legacy_tier_achievements）就這樣炸了一次。
 */
const fs = require("fs");
const path = require("path");

exports.up = async function (knex) {
  const sql = fs.readFileSync(
    path.join(__dirname, "20210101000000_baseline_initial_schema.sql"),
    "utf8"
  );
  const statements = sql
    .split("\n")
    .filter(line => !/^\s*--/.test(line)) // 去掉註解行（含檔頭），避免與第一句 CREATE 黏在一起被濾掉
    .join("\n")
    .split(";")
    .map(s => s.trim())
    .filter(s => /^CREATE TABLE/i.test(s));

  for (const stmt of statements) {
    await knex.raw(stmt);
  }
};

// baseline 不回滾（與原 docker init 對等，無對應 down）。
exports.down = async function () {};
