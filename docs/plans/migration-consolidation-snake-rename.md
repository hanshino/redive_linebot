# Migration 收攏 + Table 命名 snake_case 統一

> 目標：(1) 把「`Princess.sql` docker init + knex migration」兩套來源收攏成 **knex 單一來源**，新人空庫可一鍵啟動、**線上零 schema 變更**；(2) 把 legacy 駝峰表名統一成 snake_case。
> 兩件事用兩支 PR 拆開做：PR#1 純賺、不碰線上；PR#2 會動線上、需部署窗口。

## 進度

- **Phase 0 線上審計：完成**（2026-06-26）。關鍵結論：`User` 已於 batch 38 改名為 `user`（移出改名清單，14→13）；5 張空表是新功能待啟用（不砍）；13 張 legacy 表全活躍（全改名）；12 條 FK 全在 snake_case 表間、零指向 legacy 表、零 trigger（DB 層改名安全）；線上共 77 表。
- **Phase 1 收攏：完成、未 commit**（分支 `chore/consolidate-migrations-knex`）。空庫 throwaway 驗證：`yarn migrate` → 132 支跑完 = **77 表（與線上一致）**、冪等、`Admin` 修復；`yarn knex seed:run` → 6 seeders OK。待 review 後 commit/PR。
- **Phase 2 改名：完成、未部署**（分支 `chore/rename-legacy-tables-snake`，stacked on PR#1）。改名 migration + 30 檔 code/test（13 表）；空庫驗證 → 77 表全 snake、PascalCase 殘留 0、冪等；離線測試 62 pass。**需 PR#1 先 merge+部署，再於部署窗口上這支（migration + code 同一 release）。**

## 背景事實（已驗證）

- `migration/Princess.sql` 建 26 張底表，靠 `docker-entrypoint-initdb.d` **僅首次啟動**注入。
- `app/migrations/` 131 支（88 createTable / 15 alterTable）疊在其上。**最早一支 `20210728152528` 第一件事就是 `alter "Guild"`**，而 `Guild` 只由 SQL 建 → 拔掉 SQL 直接空庫 `yarn migrate` 會在第一支炸。兩套互相依賴。
- `Princess.sql` **無 FK、無 trigger** → 改名風險大降（rename 的痛點通常是 FK/trigger，這裡沒有）。
- 棄用表前人已清一輪（`20260327_drop_unused_tables.js` 等）。
- 6 支 seeder：`GachaPool / ChatExpUnit / MinigameLevel / PrestigeBlessings / PrestigeTrials / SubscribeCard`。
- knex `^3.2.10`，knexfile 無特殊 migrations 設定（預設 `./migrations`、`knex_migrations` 表）。

## 待處理 legacy 駝峰表（14）與改動規模（引號內引用點）

| 表 | refs | 表 | refs |
|---|---|---|---|
| Inventory | 13 | Guild | 4 |
| GachaPool | 9 | CustomerOrder | 3 |
| GuildConfig | 9 | GlobalOrders | 2 |
| GuildMembers | 8 | PrincessUID | 2 |
| GuildBattleFinish | 5 | GuildBattleConfig / MessageRecord / TotalEventTimes | 各 1 |
| Admin | 4 | **User** | **0 ⚠️ 疑休眠** |

合計約 62 點，幾乎都在 `app/src/model/**` 的 `table:` 宣告。`User` 引用 0，可能該 drop 而非 rename → 待 Phase 0 確認。

---

## Phase 0 — 線上唯讀調查（執行前的必要輸入）

由線上 agent 跑唯讀盤點（prompt 見對話），回傳：
1. `SELECT name, batch, migration_time FROM knex_migrations ORDER BY id;` — baseline 補跑順序的依據。
2. `information_schema.tables` 全表 row_count + update_time — 確認休眠/空表（首要嫌疑 `User`）。
3. 14 張 legacy 表各自 `COUNT(*)` 與是否仍存在。
4. `key_column_usage` + `SHOW TRIGGERS` — 確認後續 knex migration 有無新增 FK/trigger 牽連 legacy 表（SQL 本身沒有，但要查 knex 後來加的）。
5. `SHOW CREATE TABLE` for Guild/User/Inventory/GachaPool — 改名與 baseline 欄位核對。

**Phase 0 出口決策**：`User`（及任何 row=0 的 legacy 表）→ rename 或 drop。

---

## Phase 1 — 收攏成 knex（PR#1，線上零 schema 變更）

1. 新增 baseline migration `app/migrations/20210101000000_baseline_initial_schema.js`：
   - 內容 = `Princess.sql` 的 26 張 `CREATE TABLE` **逐字搬入**，唯一改動是 `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`，以 `knex.raw` 執行。
   - 為何用 SQL 原文而非線上 `SHOW CREATE`：baseline 必須代表**原始 init 狀態**，後面的 alter/drop 才能在空庫上正確 replay。線上 `SHOW CREATE` 只當交叉核對。
   - `down()` 留空（baseline 不回滾）。
   ```js
   // ponytail: 直接搬 Princess.sql + IF NOT EXISTS，prod 上全 no-op，空庫上建底表
   exports.up = async (knex) => {
     await knex.raw(`CREATE TABLE IF NOT EXISTS \`Guild\` (...);`);
     // ... 其餘 25 張
   };
   exports.down = async () => {};
   ```
   - ⚠️ **地雷（已避開）**：`Princess.sql` 對 `chat_exp_unit`/`chat_level_title`/`chat_range_title`/`subscribe_type` 有 `TRUNCATE`+`INSERT`。baseline **絕不可**帶這段——否則 prod 跑 migrate 會 `TRUNCATE chat_exp_unit` 清掉轉生新曲線。baseline 只含 26 句 `CREATE TABLE IF NOT EXISTS`，資料全交給 `app/seeds/*`。實作為 `.js`（讀檔逐句跑）+ `.sql`（純 schema）一對，避開 DDL 反引號/單引號塞 JS 字串的問題。
2. 拔掉 `docker-compose.yml` 的 `./migration:/docker-entrypoint-initdb.d` 掛載；刪除 `migration/Princess.sql`。
3. 新人啟動流程更新（README / CLAUDE.md）：`make infra` → `cd app && yarn migrate && yarn knex seed:run`。
4. **驗證（空庫實跑）**：
   - 全新 volume：`docker compose down -v && make infra`。
   - `yarn migrate` 應一路綠到底；`yarn migrate` 再跑一次應 no-op（驗冪等）。
   - 比對最終表集合 = 目前線上現役表集合。
5. **部署（prod 安全）**：照常 `docker exec redive_linebot-worker-1 yarn migrate`。baseline 因 `IF NOT EXISTS` 全跳過，只在 `knex_migrations` 補一筆 → **零 schema 變更**。knex 3 會把這支「時間戳較早但未執行」的 pending 補跑，預設 list validation 不受影響。

---

## Phase 2 — snake_case 改名（PR#2，會動線上，需部署窗口）

> 誠實提醒：改表名 = prod schema 變更，**做不到對線上零影響**。但 `RENAME TABLE` 是 metadata-only、毫秒級、不複製資料；無 FK/trigger（待 Phase 0 終認）→ 真正風險只剩 **code 與 schema 必須同步部署**。本 bot 為 reply-only，部署當下若不同步，少數訊息會短暫報錯。

1. 定案映射（Phase 0 後，扣除改判為 drop 的表），例：
   `Guild→guild`、`GuildConfig→guild_config`、`GuildMembers→guild_members`、`GuildBattleConfig→guild_battle_config`、`GuildBattleFinish→guild_battle_finish`、`GachaPool→gacha_pool`、`GlobalOrders→global_orders`、`CustomerOrder→customer_order`、`Inventory→inventory`、`MessageRecord→message_record`、`PrincessUID→princess_uid`、`TotalEventTimes→total_event_times`、`Admin→admin`。（`User` 已於 batch 38 改名為 `user`，不在清單。共 **13 張**。）
2. 新增 migration `<ts>_rename_legacy_tables_to_snake.js`：每張 `RENAME TABLE`，以 `hasTable(old) && !hasTable(new)` 守衛（空庫與 prod 都冪等）。`down()` 反向 rename。
3. Code 改動（同 PR）：把約 62 個引用點改成 snake_case。已知熱點檔：
   `model/platform/line.js`、`model/princess/guild/battle.js`、`model/application/Statistics.js`、`model/princess/gacha/index.js`、`model/application/Inventory.js`、`model/application/Guild.js`、`service/RaceService.js`、`service/AchievementEngine.js`，及對應 `__tests__`。逐一精確替換（引號包住的表名），勿誤傷同名變數/英文字。
4. `yarn test:app` + `yarn lint:app` 綠燈。
5. **部署 runbook（原子）**：
   - 選低流量窗口。
   - 部署「使用新表名的 code」+ 在**同一次 release** 跑 rename migration（兩者必須一起上）。
   - 重啟 bot + worker。
   - 冒煙測試：抽測會打到改名表的指令（轉蛋 / 戰隊 / 背包 / 排行）。
   - **回滾**：跑 migration `down()`（反向 rename）+ redeploy 舊 image。

---

## 風險清單

- `User` 等 row=0 表：rename 或 drop，Phase 0 拍板。
- 後續 knex migration 可能新增了 FK 指向 legacy 表（SQL 原文沒有）→ Phase 0 的 `key_column_usage` 查證；MySQL `RENAME` 會自動更新指向被改名表的 FK，但仍需驗。
- baseline 時間戳與線上 `knex_migrations` 既有檔名不可衝突 → Phase 0 清單確認。
- 部署同步：Phase 2 code 與 migration 必須同 release，否則短暫報錯。
