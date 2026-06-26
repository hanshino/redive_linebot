# 任務：說話等級「轉生」系統 — 實際節奏 vs 設計預期（唯讀調查）

> 交給有 production DB 讀取權限的線上 agent 執行。回來後與 codebase 對照討論。

你對 production MySQL（database = `Princess`）有唯讀權限。請依序執行下列查詢，**回傳每段查詢的原始結果表格**＋1–2 行客觀觀察。只跑 SELECT，不要寫入。production 是 MySQL 9.6（CTE / window function 可用）。讀 CJK 欄位請加 `--default-character-set=utf8mb4`，否則中文顯示為 ????。今天日期：2026-06-26。

## 背景
轉生系統約 2026-05 上線（實際 T-0 用 Query A 抓）。**已部署**的設定（取自 codebase，但 prod seed 需先驗證）：
- XP 曲線：`total_exp(L) = round(13 × L²)`，Lv.100 = **130,000 XP**
- 單句基礎：90 XP/則（可被 Redis `CHAT_GLOBAL_RATE` 覆寫，無法從 DB 看）
- 冷卻：<1s 0% / 1-2s 10% / 2-4s 50% / 4-6s 80% / ≥6s 100%
- 群組加成：`1 + max(0, 人數-5) × 0.02`
- 日邊際遞減：0-400 @100% / 400-1000 @30% / 1000+ @3%
- 蜜月（prestige_count=0）：遞減前 ×1.2
- 試煉（皆 60 天）：★1=10,000 / ★2=9,000 / ★3=12,500 / ★4=12,500 / ★5=10,000

⚠️ 原始設計 spec 用的是 27K 曲線，2026-04-30 才改成 130K。下面「設計預期」來自原 spec，**核心問題就是改版後是否仍成立**。

## 設計預期（要驗證的目標值）
- moderate（日均 ~150 effective XP）首次轉生 ★1 ≈ **6 個月（~180 天）**
- 完成全 5 試煉覺醒：moderate **~2.6 年** / heavy **~1.3 年** / whale **~11 個月**
- 各層 effective 日產：moderate **~150** / heavy **~295** / whale **~388**
- 各試煉 moderate 應能 60 天內達標（★5 最吃緊）
- 遷移回溫（27K 時代估算，僅供對照）：whale ~7 天到 Lv.50、heavy ~20 天、moderate ~45 天

## 相關資料表（DB=Princess）
- `chat_user_data`(user_id, prestige_count 0-5, current_level 0-100, current_exp 0-130000, awakened_at, active_trial_id, active_trial_started_at, active_trial_exp_progress, created_at)
- `chat_exp_unit`(unit_level PK, total_exp) — 曲線查表
- `chat_exp_daily`(user_id, date[UTC+8], raw_exp, effective_exp, msg_count, honeymoon_active, trial_id) — 每用戶每日聚合，永久保留
- `chat_exp_events`(user_id, group_id, ts, raw_exp, effective_exp, cooldown_rate, group_bonus, modifiers JSON) — 事件明細，僅滾動保留 30 天
- `prestige_trials`(id 1-5, slug, star, required_exp, duration_days) / `prestige_blessings`(id 1-7, slug, display_name)
- `user_prestige_trials`(user_id, trial_id, started_at, ended_at, status['active'|'passed'|'failed'|'forfeited'], final_exp_progress) — append-only，每列一次挑戰
- `user_blessings`(user_id, blessing_id, acquired_at_prestige, acquired_at) — UNIQUE(user_id,blessing_id)
- `user_prestige_history`(user_id, prestige_count_after 1-5, trial_id, blessing_id, cycle_started_at, prestiged_at, cycle_days GENERATED=DATEDIFF) — 每次轉生事件，永久保留

---

## Query 0 — 先驗證 prod seed（最重要：prod 曾需手動 seed:run）
```sql
SELECT unit_level, total_exp FROM chat_exp_unit WHERE unit_level IN (1,10,50,90,100) ORDER BY unit_level;
SELECT COUNT(*) AS curve_rows FROM chat_exp_unit;
SELECT id, slug, star, required_exp, duration_days FROM prestige_trials ORDER BY id;
SELECT id, slug, display_name FROM prestige_blessings ORDER BY id;
```
**期望**：Lv.100=130000、Lv.50=32500、curve_rows=101；trials required_exp = 10000/9000/12500/12500/10000；blessings 7 列。**任何一項對不上就是部署問題，先回報。**

## Query A — 時間線與人口分布（優先）
```sql
-- T-0 與資料跨度
SELECT MIN(cycle_started_at) AS t0_migration FROM user_prestige_history;
SELECT MIN(`date`) AS first_daily, MAX(`date`) AS last_daily,
       DATEDIFF(MAX(`date`), MIN(`date`))+1 AS span_days FROM chat_exp_daily;
SELECT COUNT(*) AS total_users, MIN(created_at) AS first_record FROM chat_user_data;

-- 轉生次數分布（覺醒漏斗的底）
SELECT prestige_count, COUNT(*) AS users FROM chat_user_data GROUP BY prestige_count ORDER BY prestige_count;

-- 目前等級分布
SELECT CASE
    WHEN current_level=0 THEN '0'
    WHEN current_level BETWEEN 1 AND 9 THEN '01-09'
    WHEN current_level BETWEEN 10 AND 29 THEN '10-29'
    WHEN current_level BETWEEN 30 AND 49 THEN '30-49'
    WHEN current_level BETWEEN 50 AND 69 THEN '50-69'
    WHEN current_level BETWEEN 70 AND 89 THEN '70-89'
    WHEN current_level BETWEEN 90 AND 99 THEN '90-99'
    WHEN current_level=100 THEN '100' END AS lvl_bucket,
  COUNT(*) AS users
FROM chat_user_data GROUP BY lvl_bucket ORDER BY MIN(current_level);  -- 字串排序會把 '100' 排錯，用 MIN(level) 排

-- 近 30 天有產 XP 的活躍人數
SELECT COUNT(DISTINCT user_id) AS active_30d
FROM chat_exp_daily WHERE `date` >= DATE_SUB(CURDATE(), INTERVAL 30 DAY);
```

## Query B — 實際日產出分層 vs 設計（核心「速度」指標，優先）
realized daily = 上線以來 effective 總和 ÷ 帳齡天數（含沉默日，與設計「日均 XP」可比）。
```sql
-- 分層人數與平均實際日產
WITH u AS (
  SELECT user_id,
         SUM(effective_exp) AS sum_eff, SUM(raw_exp) AS sum_raw,
         COUNT(*) AS active_days,
         GREATEST(DATEDIFF(CURDATE(), MIN(`date`))+1, 1) AS span_days
  FROM chat_exp_daily GROUP BY user_id
)
SELECT CASE
    WHEN sum_eff/span_days < 50  THEN '2 light (<50)'
    WHEN sum_eff/span_days < 200 THEN '3 moderate (50-200)'
    WHEN sum_eff/span_days < 600 THEN '4 heavy (200-600)'
    ELSE '5 whale (600+)' END AS tier,
  COUNT(*) AS users,
  ROUND(AVG(sum_eff/span_days),1) AS avg_realized_daily_eff,
  ROUND(AVG(sum_raw /NULLIF(active_days,0)),1) AS avg_activeday_raw,
  ROUND(AVG(sum_eff /NULLIF(sum_raw,0)),3) AS eff_to_raw_ratio
FROM u GROUP BY tier ORDER BY tier;

-- 實際日產 effective 的分位數
WITH u AS (
  SELECT user_id, SUM(effective_exp)/GREATEST(DATEDIFF(CURDATE(),MIN(`date`))+1,1) AS daily_eff
  FROM chat_exp_daily GROUP BY user_id
),
r AS (SELECT daily_eff, PERCENT_RANK() OVER (ORDER BY daily_eff) pr FROM u)
SELECT ROUND(MIN(CASE WHEN pr>=0.50 THEN daily_eff END),1) p50,
       ROUND(MIN(CASE WHEN pr>=0.75 THEN daily_eff END),1) p75,
       ROUND(MIN(CASE WHEN pr>=0.90 THEN daily_eff END),1) p90,
       ROUND(MIN(CASE WHEN pr>=0.95 THEN daily_eff END),1) p95,
       ROUND(MIN(CASE WHEN pr>=0.99 THEN daily_eff END),1) p99,
       ROUND(MAX(daily_eff),1) max_daily
FROM r;

-- 蜜月 vs 非蜜月 日產（近 30 天）
SELECT honeymoon_active, COUNT(*) AS day_rows,
       ROUND(AVG(raw_exp),1) avg_raw, ROUND(AVG(effective_exp),1) avg_eff,
       ROUND(AVG(effective_exp)/NULLIF(AVG(raw_exp),0),3) ratio
FROM chat_exp_daily WHERE `date` >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
GROUP BY honeymoon_active;
```
**對照**：avg_realized_daily_eff 各層 vs 設計 moderate~150 / heavy~295 / whale~388。

## Query C — 首次轉生節奏推算 vs 「6 個月」錨點（優先）
針對還在第一輪（prestige_count=0）的人，用實際日產推算爬到 Lv.100（130K）要幾天。
```sql
WITH u AS (
  SELECT user_id, SUM(effective_exp)/GREATEST(DATEDIFF(CURDATE(),MIN(`date`))+1,1) AS daily_eff
  FROM chat_exp_daily GROUP BY user_id
)
SELECT CASE
    WHEN u.daily_eff < 50  THEN '2 light'
    WHEN u.daily_eff < 200 THEN '3 moderate'
    WHEN u.daily_eff < 600 THEN '4 heavy'
    ELSE '5 whale' END AS tier,
  COUNT(*) AS users,
  ROUND(AVG(c.current_level),1) AS avg_level_now,
  ROUND(AVG(u.daily_eff),1) AS avg_daily_eff,
  ROUND(AVG(130000.0/u.daily_eff),0) AS proj_full_climb_days,        -- 對照設計 moderate≈180
  ROUND(AVG((130000-c.current_exp)/u.daily_eff),0) AS proj_days_remaining
FROM chat_user_data c JOIN u ON u.user_id=c.user_id
WHERE c.prestige_count=0 AND u.daily_eff > 5
GROUP BY tier ORDER BY tier;
```

## Query D — 實際轉生循環耗時（優先；資料可能稀少）
```sql
SELECT prestige_count_after, COUNT(*) AS events,
       MIN(cycle_days) min_d, ROUND(AVG(cycle_days),1) avg_d, MAX(cycle_days) max_d
FROM user_prestige_history GROUP BY prestige_count_after ORDER BY prestige_count_after;

-- 全部轉生事件列出（量應該不大）
SELECT user_id, prestige_count_after, trial_id, blessing_id, cycle_started_at, prestiged_at, cycle_days
FROM user_prestige_history ORDER BY prestiged_at;
```
**注意**：第一次轉生（prestige_count_after=1）的 `cycle_started_at` 對所有人都是 T-0 遷移時間，所以它的 cycle_days＝「上線到他轉生的天數」，混入了「他多早開始衝」而非純爬升速度；prestige 2+ 才是乾淨的單輪耗時。

## Query E — 試煉難度與通過率（優先；★5 重點）
```sql
-- 註：codebase migration 有 display_name (NOT NULL)，但實測 prod 該欄位查詢失敗 → 可能 schema drift，改用 slug/star。
SELECT t.trial_id, pt.slug, pt.star, pt.required_exp,
  SUM(t.status='passed') passed, SUM(t.status='failed') failed,
  SUM(t.status='forfeited') forfeited, SUM(t.status='active') active, COUNT(*) attempts,
  ROUND(SUM(t.status='passed')/NULLIF(SUM(t.status IN('passed','failed','forfeited')),0),3) pass_rate_closed,
  ROUND(AVG(CASE WHEN t.status='passed' THEN DATEDIFF(t.ended_at,t.started_at) END),1) avg_days_to_pass
FROM user_prestige_trials t JOIN prestige_trials pt ON pt.id=t.trial_id
GROUP BY t.trial_id, pt.slug, pt.star, pt.required_exp ORDER BY t.trial_id;

-- 失敗者離目標多近（驗證門檻是否過高）
SELECT t.trial_id, pt.required_exp,
  ROUND(AVG(t.final_exp_progress),0) avg_final_progress_failed,
  ROUND(AVG(t.final_exp_progress)/pt.required_exp,3) avg_pct_of_target
FROM user_prestige_trials t JOIN prestige_trials pt ON pt.id=t.trial_id
WHERE t.status='failed' GROUP BY t.trial_id, pt.required_exp ORDER BY t.trial_id;

-- 進行中試煉是否逼近 60 天到期
SELECT trial_id, COUNT(*) active,
  ROUND(AVG(DATEDIFF(CURDATE(), started_at)),1) avg_days_in,
  SUM(DATEDIFF(CURDATE(), started_at) > 60) over_60d
FROM user_prestige_trials WHERE status='active' GROUP BY trial_id ORDER BY trial_id;
```

## Query F — 試煉選擇偏好 + 祝福分布（次要）
```sql
SELECT trial_id, COUNT(*) n FROM user_prestige_history
WHERE prestige_count_after=1 GROUP BY trial_id ORDER BY n DESC;   -- 首轉大家先挑哪個

SELECT b.blessing_id, pb.display_name, COUNT(*) picks
FROM user_blessings b JOIN prestige_blessings pb ON pb.id=b.blessing_id
GROUP BY b.blessing_id, pb.display_name ORDER BY picks DESC;
```

## Query G — 機制健檢（次要；events 僅 30 天）
```sql
SELECT cooldown_rate, COUNT(*) msgs FROM chat_exp_events GROUP BY cooldown_rate ORDER BY cooldown_rate;
SELECT ROUND(group_bonus,1) gb, COUNT(*) msgs FROM chat_exp_events GROUP BY gb ORDER BY gb;
-- 遞減咬合程度：每日 raw 落在哪個 tier
SELECT CASE WHEN raw_exp<=400 THEN '1 ≤400' WHEN raw_exp<=1000 THEN '2 400-1000' ELSE '3 1000+' END tier,
  COUNT(*) user_days, ROUND(AVG(effective_exp/NULLIF(raw_exp,0)),3) avg_ratio
FROM chat_exp_daily WHERE `date`>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) GROUP BY tier ORDER BY tier;
```

## 回報時請在最後給出結論（針對這些問題）
1. Query 0 的 seed 全部符合 130K 版設定嗎？有沒有部署不一致？
2. 各層實際日產（B）vs 設計（moderate 150 / heavy 295 / whale 388）：高了還是低了、差多少？
3. moderate 推算首次轉生天數（C 的 proj_full_climb_days）相對 180 天：符合、太快、還是太慢？
4. 目前實際走到第幾轉的人數（A/D）、覺醒幾人？
5. 哪個試煉通過率最低 / 失敗者離目標多遠（E）？★5 是否真的最吃緊？有沒有人卡在 60 天到期？
6. 任何看起來明顯異常或反直覺的數字。

回傳原始表格即可，數據以外不用過度解讀。
