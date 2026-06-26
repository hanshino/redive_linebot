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
