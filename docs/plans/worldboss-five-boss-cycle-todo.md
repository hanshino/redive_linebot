# 世界王五王周回改造 TODO

- 整理日期：2026-07-25
- Branch：`feat/worldboss-v2`
- 狀態：設計討論暫停；尚未修改程式、migration 或既有定案 spec
- 現行 spec：`docs/superpowers/specs/2026-07-19-worldboss-v2-design.md`

## 1. 為何需要改造

現行 v2 是「全服同時只有一隻 active 王，擊破後立刻建立下一輪並隨機換王」。使用者實際 E2E 後確認，目標玩法應為：

- 每個賽季設定五隻不同的王，固定為 1–5 號位。
- 同一周回五隻王同時存在，玩家可自由選擇任一尚未擊破的王。
- 五隻全部擊破後才進入下一周回。
- 下一周回沿用同一套五王與固定順序。

這不是 Flex 多顯示四張卡而已；資料模型、攻擊目標、周回切換、API、聊天與 LIFF 都需調整。現有 season lifecycle、quota、RPG 傷害／EXP、contribution、排名與結算大致可保留。

## 2. 已確認的產品決策

1. **每季設定五王**：管理員在 draft 賽季選定五隻王與 1–5 順序。
2. **五隻必須不同**：王圖鑑不足五隻時不得完成可開啟的賽季。
3. **自由選王**：玩家可攻擊該周回任一尚未擊破的王，不必依 1 → 5 順序。
4. **溢傷作廢**：指定王剩 100 HP、玩家算出 500 傷害時，只造成 100 有效傷害，其他王不承接 400。
5. **排行榜記有效傷害**：上述 contribution 記 100，不記完整 500，避免尾刀放大排名。
6. **全滅回覆**：擊破該周回最後一隻王的攻擊回覆只顯示本次結果與「本周回全滅」；玩家下次輸入 `#世界王` 才看到新周回五王。
7. **開季完整快照**：開季時凍結五王的名稱、圖片、描述與 HP 權重；後續修改王圖鑑不影響進行中賽季或歷史呈現。
8. **資料模型方向**：採獨立的每季五王 roster snapshot 表，不用 JSON，也不在 season 放五組重複欄位。

## 3. 已提出、尚待確認的核心資料模型

```text
world_boss_season
  └─ world_boss_season_boss × 5
       - position: 1–5
       - world_boss_id
       - snapshot_name
       - snapshot_image
       - snapshot_description
       - snapshot_hp_weight

  └─ world_boss_round × 每周回 5
       - cycle_no
       - position
       - season_boss_id
       - max_hp / current_hp
       - status: active / cleared
```

建議約束：

- `UNIQUE(season_id, position)`：每季每個位置只有一隻王。
- `UNIQUE(season_id, world_boss_id)`：每季五隻王不得重複。
- `UNIQUE(season_id, cycle_no, position)`：每周回每個位置只有一筆 encounter。
- `position` 必須介於 1–5。
- `cycle_no >= 1`。
- `max_hp > 0` 且 `0 <= current_hp <= max_hp`。
- `active` 對應 `current_hp > 0`；`cleared` 對應 `current_hp = 0` 與 `cleared_at`。

開季 transaction 建議流程：

1. 鎖定並驗證 draft season。
2. 驗證五個位置齊全且五隻不同。
3. 從 `world_boss` 建立完整 roster snapshot。
4. 寫入 season active/start time。
5. 同時建立第 1 周回的五筆 `world_boss_round`。

周回切換建議：

- 每隻王獨立被攻擊與清除。
- 最後一隻被擊破的同一 transaction 內，確認本周回五筆皆 cleared，再建立下一周回五筆。
- 依 DB unique constraint 防止 concurrent final kills 重複建立下一周回。
- 不新增 `world_boss_cycle` table；暫定由 round rows 的 `cycle_no` 推導目前周回，減少一個真相來源。

> 以上資料模型尚未取得最終確認；下次從這一節開始 review。

## 4. 可保留的現有功能

- `world_boss_season` 的 draft → active → settled 狀態機。
- 全服唯一 active season 與到期 cron 結算。
- 每日 cost quota、台灣日界與玩家 row locking。
- 5 秒攻擊冷卻。
- RPG 職業傷害、裝備加成與每刀職業 EXP。
- Contribution 對 season、user、round 的關聯。
- 賽季總有效傷害排行榜與 competition ranking `1,1,3`。
- 女神石、稱號與 authoritative paid reward ledger。
- 最近 settled reward 的 LINE／LIFF 顯示。
- Admin privilege 與 reply-only delivery 限制。

## 5. 預期需要修改的範圍

### Schema / migration

- 使用 `cd app && yarn knex migrate:make <name>` 建立新 migration，不手寫檔名。
- 新增 `world_boss_season_boss` 快照表。
- 調整 `world_boss_round`：新增 `cycle_no`、`position`、`season_boss_id`，移除現行每季唯一 active round 的約束／語意。
- 評估目前本機 E2E Season 1／Round 1 的處理方式；feature branch 未部署，可選擇乾淨重建 v2 schema 或明確轉換，規格需先決定。

### Backend

- `WorldBossSeasonService`：draft roster CRUD／validation、開季建立快照與五筆首周回。
- `WorldBossBattleService`：攻擊必須指定 round/encounter；鎖指定王；有效傷害截斷；最後一王觸發下一周回。
- `WorldBossRound` model：從單一 active row 查詢改為目前周回五筆查詢與指定 row lock。
- Admin handler/API：season payload 加五王位置；active/settled roster 只讀。
- Public status API：由 `{ round, boss }` 改為 `{ cycleNo, bosses[] }`。
- Postback payload：加入不可偽造／需重驗證的 encounter ID 或 position + cycle。
- Domain errors：已擊破、過期目標、非目前周回、周回切換競爭等。

### LINE Flex

- `#世界王` 改為五王 carousel，每張顯示位置、王、HP 與攻擊按鈕。
- 已擊破王顯示 cleared，不提供攻擊按鈕。
- 攻擊成功回覆顯示實際有效傷害，而非計算出的完整傷害。
- 最後一王回覆本周回全滅，不直接塞入下一周回五張卡。
- 保留最近 settled reward 卡；注意 LINE carousel bubble 數量上限及 active 五王 + reward 的組合。

### Frontend

- Admin `/admin/worldboss`：草稿活動表單加入五個不可重複的王選擇器與順序調整。
- LIFF `/worldboss`：顯示目前周回五王、各自 HP／cleared 狀態、排行榜與個人戰報。
- API snapshot coherence 仍須綁定 season/cycle，避免 refresh 混入不同周回資料。

### Tests

- migration constraints 與 rollback。
- roster 必須恰好五隻且不可重複。
- 開季原子建立五個 encounter。
- 自由選任一存活王。
- 已 cleared／舊 cycle target 拒絕。
- 溢傷作廢且 contribution 只記有效傷害。
- 兩名玩家同時擊殺最後兩隻，只建立一次下一周回。
- 同一隻王 concurrent lethal attack 不重複扣血／建周回。
- 周回 HP tier × snapshot weight。
- LINE 五王 carousel、cleared 狀態、reply-only。
- Public/admin API DTO、BIGINT、UTC 與 frontend build/lint。
- 保留既有 quota、EXP rollback、結算與 reward regression coverage。

## 6. 粗略工作量

- 性質：中大型改造，不是完整重寫。
- 預估：一支或數支 migration、約 12–20 個 product/test files。
- 可保留約一半以上既有 season／quota／reward 架構。
- 最大風險：最後幾隻王被 concurrent attacks 擊破時，周回只能切換一次，且不能漏算／多算有效傷害。

## 7. 下次討論順序

1. Review 並確認第 3 節核心資料模型。
2. 決定 draft roster 是建立 season 時必填，還是可先建 season 再另存五王。
3. 定義 postback identity 與過期卡片行為。
4. 定義最後一王擊破／下一周回建立的精確 transaction 與併發約束。
5. 定義 LINE carousel 與 LIFF 資料 contract。
6. 定義 admin UX、錯誤訊息與 active/settled 歷史呈現。
7. 補齊測試／migration 策略，形成正式 design spec。
8. 使用者核准 spec 後再寫 implementation plan；尚未授權實作。

## 8. 目前本機 E2E 狀態

2026-07-25 建立的本機活動：

- Season ID：1
- 名稱：`世界王 E2E 測試 2026-07-25`
- 狀態：active
- 現行模型第 1 輪：冥府騎士
- 初始 HP：37,500
- 已觀察到兩筆攻擊：4,991／cost 7、4,704／cost 10
- 查詢時剩餘 HP：27,805

這些是本機測試資料，不是程式碼變更。改造 schema 前需先決定保留、轉換或清除。
