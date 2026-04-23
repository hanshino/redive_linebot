# 說話等級大改版：轉生系統設計

## 背景與痛點

現況：
- 等級上限 173（由 `chat_exp_unit` table 驅動，非程式碼硬編），但 title 系統實際只覆蓋到 Level 80，81–173 顯示會 crash
- 已有 1 位用戶達到上限（XP 甚至超出 table 範圍），82 位用戶在 Level 100 以上
- 平均等級 16.9，絕大多數用戶仍在低等
- 娛樂性不足：到頂後無事可做
- 稱號被等級綁死，無個人化空間

> 本文件為整個功能的重構設計，不繼承現行 `chat_user_data` / `chat_level_title` / `chat_exp_unit` 的架構與資料。

## 目標節奏

基於 2026-04-23 資料盤點（22,131 位有 `created_at` 的活躍玩家）的**實際日均 XP 分層**：

| 代表層級 | 終身日均 XP | 人數 |
|---|---|---|
| Moderate（p95 附近）| ~150 | 1,989 |
| Heavy | ~656 | 858 |
| Whale（Lv.100+ 主體）| ~3,760 | 408 |

真正的目標池 = **3,255 人**（moderate + heavy + whale）。Casual 層（n=13,791、日均 2 XP）多為加入機器人但幾乎不發言的掛名用戶，不是設計對象。

錨點：**moderate 玩家（日均 150 XP）在約 6 個月內完成 ★1 首轉**（套用邊際遞減後實產 150/日 × 180 天 ≈ 27K XP）。各層完成 5 試煉覺醒的預估節奏（opt-in 試煉 + 祝福模型下）：**whale ~11 個月、heavy ~1.3 年、moderate ~2.6 年**，詳細節奏見下方試煉與覺醒章節。

Lv.100 轉生門檻不降，變動的是曲線、日 XP 邊際遞減機制與 XP 單位值。

## 核心設計：轉生 + 試煉系統

### 等級上限調整

- 新轉生門檻：**Level 100**
- 轉生後等級歸零，重新爬回 100
- 上限數字本身不硬編，由 `prestige_trials` table 的資料筆數決定（目前規劃 5 次）
- **5 次轉生為系統硬邊界**：通過 5 個試煉後進入「覺醒」終態，不再開放轉生。理由：保留設計彈性，未來要擴充 ★6+ 內容時所有人從覺醒這同一條起跑線出發，不會有 open-ended stacking 卡死後續設計
- **XP 曲線重做**：Lv.1→100 總量 **27,000 XP**（舊制 8.4M 砍 ~311×）

### XP 曲線形狀

**平方律**：`total_exp(L) = round(2.7 × L²)`，Lv.1→100 總量 **27,000 XP**。

| Lv. | 累計 XP | 單等 XP（近似）|
|---|---|---|
| 10 | 270 | ~51 |
| 30 | 2,430 | ~159 |
| 50 | 6,750 | ~267 |
| 70 | 13,230 | ~375 |
| 90 | 21,870 | ~483 |
| 100 | 27,000 | ~537 |

早期 30 等快速爬（moderate 玩家約 16 天），中後期放緩但不像立方律那樣卡牆。最後 10 級佔總量約 20%，有分量但不過頭。

### 日 XP 邊際遞減

採用**邊際遞減**（非硬上限），讓頂端玩家自然壓縮到約 2.6× moderate 產速，又不讓人「卡上限就不想聊天」。

| 日累計 XP 區間 | 倍率 |
|---|---|
| 0 – 200 | 100% |
| 200 – 500 | 30% |
| 500+ | **3%** |

**各層實際日產出：**

| 層級 | 原始日均 | 實際日均（套用遞減）| 相對 moderate |
|---|---|---|---|
| Moderate | 150 | 150 | 1.0× |
| Heavy | 656 | ~295 | 2.0× |
| Whale | 3,760 | ~388 | 2.6× |

差距從 25× 壓縮到 2.6×，落在「努力有回報但不壓倒」的健康區間。500+ tier 用 3%（非原先擬的 5%）是為了壓制覺醒 whale 疊滿產能 build 的天花板擴張。

### 基礎冷卻曲線（per-userId，跨群共用）

單句 XP 的冷卻率由「距離上次發話的時間差」決定：

| 時間差 | 倍率 |
|---|---|
| < 1s | 0% |
| 1 – 2s | 10% |
| 2 – 4s | 50% |
| 4 – 6s | 80% |
| ≥ 6s | 100%（滿速）|

**實作注意**：
- `CHAT_TOUCH_TIMESTAMP_{userId}` 的 Redis TTL **必須 ≥ 6s**（舊版 5s 是 bug：玩家在 5–6s 間隔發話時 key 已過期，被當作從未發話，等於實際滿速門檻成了 5s）→ 新實作設 **TTL 10s**
- 冷卻仍保 global per userId（跨群共用），避免玩家靠多群分散冷卻刷 XP
- ★3 試煉 override 此曲線為 8s 滿速版（見試煉章節）

曲線形狀本身不動（未來祝福 2、3 / ★3 試煉在這個 baseline 上改寫）。

### 冷卻 modifier 疊加規則（universal pipeline）

所有冷卻相關修飾（試煉 override、祝福、永久獎勵）按**同一條 pipeline** 疊加，避免 edge case 歧義：

```
baseline 表
  → 試煉 multiplier（★3 期間 ×1.33 右移；否則不動）
  → ★3 永久獎勵（「律動精通」：中段 tier 提升）
  → 祝福 override（依 tier 替換倍率）
  → 最終 cooldownRate
```

**Modifier 作用域設計（刻意讓三者不重疊）：**

| Modifier | 作用 tier | 效果 |
|---|---|---|
| 祝福 3 燃燒餘熱 | 左尾（`<1s`、`1-2s`）| 0→10%、10→30% |
| ★3 永久「律動精通」 | 中段（`2-4s`、`4-6s`）| 50→70%、80→90% |
| 祝福 2 迅雷語速 | 右尾（滿速門檻）| 6s → 5s |

三者作用域不重疊，自由疊加、無需取大取小。

**同 tier 若未來出現衝突：取最大倍率**（避免 double-dipping），但當前設計無此情況。

**疊加範例：**

*（非試煉期）baseline + 全部疊滿：*

| 時間差 | baseline | 疊滿（+祝福 2+祝福 3+★3 永久）|
|---|---|---|
| < 1s | 0% | **10%** |
| 1 – 2s | 10% | **30%** |
| 2 – 4s | 50% | **70%** |
| 4 – 5s | 80% | **90%** |
| ≥ 5s | 100% | 100% |

*（★3 試煉期）baseline ×1.33 右移 + 全部祝福與永久獎勵：*

| 時間差 | 疊滿 |
|---|---|
| < 1.33s | 10% |
| 1.33 – 2.66s | 30% |
| 2.66 – 5.33s | 70% |
| 5.33 – 7s | 90% |
| ≥ 7s | 100% |

**設計哲學**：試煉期仍套祝福效果（非失效），reason 是「試煉是挑戰，不是抹煞過往努力」。祝福玩家挑 ★3 時仍比無祝福玩家更快滿速（7s < 8s），但比非試煉期慢（7s > 5s），感覺自然。

### 轉生流程（opt-in 試煉 + 祝福選擇）

```
Lv.1 → Lv.100
  │
  └─→ (可選) 選擇一個尚未通過的試煉 ★1-★5（順序自由）
         │
         ├─ 進入試煉期（60 天時限）
         │    ├─ 試煉限制立即生效
         │    └─ 獲得的 XP 同時計入「試煉條件進度」與「下一輪等級進度」
         │
         ├─ 期間內累積達到 XP 條件 → 試煉通過、永久獎勵解鎖
         │   （60 天內未達成 → 失敗，可重新進入試煉，無其他懲罰）
         │
         └─ 選一個尚未取得的祝福（7 選 1）→ 轉生 Lv.1、祝福永久疊加

5 次通過 → ✨ 覺醒狀態（系統封頂，不再開放轉生）
```

**轉生條件**：Lv.100 + 通過一個未完成的試煉 + 擇取一個未取祝福。三者缺一不可。

**試煉 ↔ 等級同步**：試煉期間累積的 XP 同時計入等級進度與試煉條件。玩家感受是「邊挑戰邊爬向下一輪的 Lv.100」，不是「暫停升等去刷任務」。即使試煉失敗，期間累積的 XP 仍保留在等級裡，不浪費。

**操作入口全走 LIFF**：試煉選擇、試煉放棄（forfeit）、祝福選擇、轉生確認、進度查詢、覺醒者展示——**均透過 LIFF 頁面操作**，沒有文字指令。Lv.100 達標後群組廣播一次 CTA 「[用戶名] 已達成 Lv.100，可以前往 LIFF 進行轉生」，之後玩家自行決定何時處理。

### 未轉生蜜月（Onboarding 福利，一生一次）

新玩家（以及遷移後的舊玩家）在**還沒完成第一次轉生之前**自動享有蜜月加成，首次體驗新曲線時不會過於苦寒。

| 項目 | 內容 |
|---|---|
| 生效條件 | `prestige_count = 0`（當前轉生次數為 0） |
| 效果 | 單句 XP **+20%**，**作用於邊際遞減之前** |
| 失效時機 | 第一次轉生完成（`prestige_count` 由 0 變為 1）的瞬間，**永久消失、不再復返** |
| 涵蓋區間 | 第一次 Lv.1→100 的爬升 + 首次選擇的試煉期 |

**為什麼放在遞減之前**：moderate（日 XP ~150）全段都在 100% tier，能完整吃到 +20%；whale（日 XP ~3,760）大部分進帳落在 5% tier，蜜月加成被 diminish 吃掉大半（實際有效收益僅 ~+8%）。**結構上天然偏袒新玩家**，符合 onboarding 本意。

**首次試煉期與蜜月疊加**（蜜月 × 試煉當期倍率）：

- 首次挑 ★1（啟程，1.0×）→ **×1.2**
- 首次挑 ★2（刻苦，0.7×）→ **×0.84**（懲罰被蜜月緩衝）
- 首次挑 ★5（覺悟，0.5×）→ **×0.6**（勇者路線，痛但沒絕望）

**遷移特例**：舊系統 Lv.100+ 的 82 位「先驅者」遷移後 `prestige_count = 0`，**同樣享有蜜月加成**（視為重生補償，他們獲得「先驅者成就」紀念、但在新系統仍從零開始）。

### 試煉設計（資料驅動，opt-in、順序自由、可重試）

5 個試煉由 `prestige_trials` table 驅動。玩家自選要挑戰哪一個，通過條件為 **60 天時限內累積目標 XP**。

| 試煉 | 限制 | 通過條件（期間內累積） | moderate 預估 | 完成獎勵 |
|---|---|---|---|---|
| ★1 啟程 | 無 | **2,000 XP** | ~13 天（首次挑戰 + 蜜月加速則 ~11 天） | 觸發「啟程成就」（AchievementEngine 發獎勵） |
| ★2 刻苦 | XP ×0.7 | **3,000 XP** | ~28 天 | 永久 XP +10% |
| ★3 律動 | 冷卻嚴格化（整張表 ×1.33 右移，8s 滿速） | **2,500 XP** | ~17 天 | **律動精通**：中段 tier 提升（2-4s: 50%→70%、4-6s: 80%→90%）|
| ★4 孤鳴 | 群組加成失效 | **2,500 XP** | ~17 天 | 群組加成斜率翻倍 |
| ★5 覺悟 | XP ×0.5（最終試煉） | **5,000 XP** | ~67 天（逼近上限） | 永久 XP +15% + 觸發「覺醒成就」 |

**試煉倍率作用於遞減後的實際 XP**（非原始輸入），讓「-30%」對玩家就是每日少拿 30%，直覺一致。

**★3 冷卻 override 公式**（整張基礎表 ×1.33 右移）：

| 時間差 | baseline | ★3 試煉期 |
|---|---|---|
| < 1.33s | 0% | 0% |
| 1.33 – 2.66s | 10% | 10% |
| 2.66 – 5.33s | 50% | 50% |
| 5.33 – 8s | 80% | 80% |
| ≥ 8s | 100% | 100% |

也就是每個門檻都 × (8/6) ≈ 1.333，門檻間的相對形狀維持一致。實作時只需維護一個 baseline 表 + 一個 multiplier；不做 5 階梯客製化公式。

**試煉條件 XP 計算方式**：累積的是**應用試煉倍率後的實際入帳 XP**（與玩家當日實際看到的 XP 一致）。例：★2 期間發話原始 100 XP → diminish 後 100 → 乘試煉倍率 0.7 = **70** → 試煉條件進度 +70 + 等級進度也 +70。懲罰同時拖慢等級與試煉通過速度，設計上 ★2/★5 是「又慢又難」，不是「等級慢但試煉輕鬆過」。

**XP 條件設計原則**：moderate 玩家（日均 150 XP）在 60 天時限內均能達成，whale/heavy 輕鬆過。★5 對 moderate 是邊緣挑戰，設計上有張力但可達成。失敗無懲罰，下次轉生可重挑任一未通過的試煉。

**覺醒所需總時長預估**（含 5 次 Lv.1→100 循環 + 5 個試煉）：

| 層級 | 預估 |
|---|---|
| Moderate | ~2.6 年 |
| Heavy | ~1.3 年 |
| Whale | ~11 個月 |

比舊強制序列設計（moderate 3.4 年）更快，因為試煉期 XP 不浪費、沒有強制的全循環負面懲罰。

### 祝福系統（7 選 5，全域唯一、不可重選）

每次轉生通過試煉後，玩家從 7 個祝福中擇 1，累計 5 次後共取 5 項、放棄 2 項。祝福永久疊加、跟覺醒身份一起鎖定，**不可重選、不可重置**。

| # | 名稱 | 效果 | 最佳風格 |
|---|---|---|---|
| 1 | 語言天賦 | 單句基礎 XP **+8%** | 普惠 |
| 2 | 迅雷語速 | 冷卻滿速門檻 **6s → 5s** | burst / whale |
| 3 | 燃燒餘熱 | 冷卻初段緩衝：`<1s: 0→10%`、`1–2s: 10→30%` | 極端 burst |
| 4 | 絮語之心 | 日 XP 100% 區間 **0–200 → 0–300** | moderate |
| 5 | 節律之泉 | 日 XP 30% 區間 **200–500 → 200–600** | heavy |
| 6 | 群星加護 | 群組加成斜率 **0.02 → 0.025** | 大群玩家 |
| 7 | 溫室之語 | 群組 **< 10 人** 時 XP **×1.3** | 小群 / 私密圈 |

**祝福效果的作用點**：

- 祝福 1（+8%）：乘法疊加於單句 XP，與試煉永久獎勵一起作用
- 祝福 2、3（冷卻）：改寫或取代基礎冷卻曲線對應段
- 祝福 4、5（遞減區間）：改寫 0–200 / 200–500 邊界
- 祝福 6（群組斜率）：取代原 `0.02` 係數
- 祝福 7（小群補正）：`<10 人` 群組在群組加成之前作用

**Trade-off 設計**：7 個祝福分為四個向度（普惠 / 冷卻 / 遞減 / 群組），放棄 2 項意味著某向度必讓步。典型 build：

- **moderate 派**：1 + 4 + 6 + 7 + (2 or 5)
- **whale 產能派**：1 + 2 + 3 + 5 + 6
- **heavy 平衡派**：1 + 3 + 4 + 5 + 6
- **小圈派**：1 + 4 + 7 + 2/3 + 選修

**天花板驗算**（覺醒 whale 吃產能 build vs moderate 吃平衡 build，2026-04-23 定稿值）：

前置已套用的兩項壓制：
1. 邊際遞減 500+ tier = **3%**（非 5%）
2. 祝福 5 將 30% 區間擴到 **200–600**（非 200–700）

**覺醒 whale**（產能 build 1+2+3+5+6）：
- raw ≈ 9,330（× 1.08 祝福1 × 冷卻提升 × 1.10 群組）
- diminish（祝福 5 擴 200–600）：200 + 400×30% + 8,730×3% = 200 + 120 + 262 = **~582**
- × 1.265（★2 +10% × ★5 +15% 永久） = **~736 有效**

**覺醒 moderate**（平衡 build 1+4+6+7+1 選修）：
- raw 150 × 1.08 × 1.075 ≈ **174**
- diminish（祝福 4 擴 0–300）：174 全在 100% tier = **174**
- × 1.265 = **~220 有效**

**gap ≈ 736 / 220 ≈ 3.35×**，略超 3× 目標但已進入健康區間。接受這個值，理由：
- 覺醒 whale 付出 ~11 個月、通過全 5 試煉，強度差存在合理
- 繼續壓（例如 500+ tier 再砍到 2%）會連帶把 heavy 也壓死，不划算
- ★4 翻倍保留，群組玩家挑戰 ★4 的誘因敘事完整

**備用壓制方案**（若上線後實測 gap 漂移）：500+ tier 3%→2%（小砍）、或祝福 5 擴區間再收一階（200–600 → 200–550）。

### 隱藏成就（Build 組合彩蛋，走 AchievementEngine）

覺醒時系統檢查玩家最終的 5 祝福組合，觸發隱藏成就。**走 `AchievementEngine` 既有 reward pipeline**（可發石頭 / 道具等 reward type）。新系統已無稱號機制，所有 prestige 獎勵都集中在 AchievementEngine。

| 成就（隱藏） | 觸發條件 | 立意 |
|---|---|---|
| 疾風之道 | 祝福組含 **2 + 3**（冷卻雙修） | 獎勵追求極速的 burst 派 |
| 洪流之道 | 祝福組含 **4 + 5**（遞減雙修） | 獎勵全面擴展遞減區間的玩家 |
| 溫度兼融 | 祝福組含 **6 + 7**（大小群雙修） | 獎勵看似矛盾的兼容 |
| 孤獨之道 | 祝福組**不含 6**（放棄大群紅利） | 獎勵拒絕群體紅利的獨行派 |

### 群組可見性

**原則**：不使用 LINE Push API（點對點主動私訊）。所有系統訊息走**群組內事件觸發廣播**，透過 reply token queue 機制發送（見下方「群組廣播基礎架構」章節）。玩家個人狀態走 LIFF 主動查詢，不推播。

- **冒險小卡**（被動查看）：試煉中顯示 `⚔️ ★N 試煉進行中`、蜜月期顯示 `🌱 蜜月中`、覺醒後顯示 `✨ 覺醒者`、轉生次數顯示 `★★★`
- **群組廣播**（事件觸發，reply-only 模式）：
  - 進入試煉：`「[用戶名] 踏入了 ★N 的試煉」`
  - 試煉通過：`「[用戶名] 通過了 ★N 的試煉，永久解放 XXX」`
  - 轉生完成：`「[用戶名] 完成第 N 次轉生，選擇了祝福『XXX』」`
  - 覺醒達成：`「[用戶名] 達成覺醒！」`（可考慮特殊顯示，例如換色或額外 emoji）
- **不廣播 / 靜默處理**：
  - 試煉放棄（玩家主動在 LIFF forfeit）
  - 試煉 60 天時限到期失敗（玩家下次開 LIFF 才會看到結果）
  - 等級變動（除非跨 Lv.100 觸發轉生流程 CTA）
- **LIFF 操作**：轉生流程、試煉選擇、祝福選擇、試煉放棄、進度查詢**全走 LIFF**，玩家自主查看，系統不主動通知

### 稱號系統（廢除）

**整套稱號機制不再保留**：舊系統的 `chat_level_title`、`chat_range_title` 表與對應邏輯全部移除，新系統**純粹用等級 + 狀態 flag 顯示**，不派生任何文字稱號。

所有原先規劃要用「稱號」發的獎勵，改由 `AchievementEngine` pipeline 吸收：

| 原先規劃的稱號獎勵 | 新做法 |
|---|---|
| ★1 稱號自選功能解鎖 | 改為觸發 `啟程成就`，AchievementEngine 發獎勵 |
| ★5 覺醒者限定稱號 | 改為觸發 `覺醒成就`（+15% 永久 XP 不變） |
| 先驅者紀念稱號 | 改為觸發 `先驅者成就`（82 人一次性） |
| 隱藏 build 成就 | 本來就走 AchievementEngine，無變更 |

**UI 顯示**：冒險小卡 / 群組廣播只顯示等級數字 + 狀態 flag（`Lv.85`、`✨ 覺醒者`、`⚔️ ★3 試煉中`、`🌱 蜜月中`、`★★★ 轉生 3 次` 等），沒有任何 title 文字欄位。

### 活動與加成互動規則（v2 擴充預留）

v1 不實作活動，但曲線已預留空間。後續上線 XP 加成活動時遵循以下規則，避免破壞平衡：

**倍率活動**（例：週末 2×）
- 作用於**原始輸入**，在邊際遞減之前疊乘
- 幫中度玩家突破 200 / 500 遞減門檻，相對 whale 更受益
- **可與試煉並存**：允許策略性在活動期間挑戰 ★5（社群熱度集中、正向循環）

**1+1 升等活動**（升 1 等自動補 1 等）
- **不適用於試煉期間**，防止剝削 ★5 結構
- **每個活動期間一個上限**（建議 +5 級 / 活動期）
- 頂端玩家快速卡上限、中度玩家吃滿活動期時長 → 天然偏袒輕中度

**XP 計算順序（含祝福、蜜月）：**
```
單句 XP = base × cooldown曲線(受祝福 2/3) × 群組加成(受祝福 6/7) × (1 + 祝福1)
日累計 × 活動倍率 × (未轉生蜜月 +20%)
  →  邊際遞減（區間邊界受祝福 4/5 影響）
  →  × 試煉當期倍率 × (1 + 試煉永久獎勵 ★2/★5)
  →  實際入帳
```

**關鍵分水嶺**：活動倍率在遞減**之前**（幫助突破門檻），試煉倍率與試煉永久獎勵在遞減**之後**（直覺一致：`-30%` 就是少拿 30%、`+10%` 就是多拿 10%）。

例：★5 試煉期間遇到 2× 活動 → 2× × 0.5× = 1.0×（等於臨時取消懲罰，不白嫖）。

### 反濫用設計哲學（2026-04-23 定稿）

本系統是**娛樂型等級系統**，不是經濟系統。核心判斷：**刷 XP 的玩家只會自己感到空虛，對其他玩家無實質傷害**。因此刻意**不做**複雜反濫用機制。

**刻意不做的（連帶拒絕未來提案）：**

| 機制 | 拒絕理由 |
|---|---|
| Tag 互刷偵測（D 類）| 3+ 人群組的互 tag 是日常對話行為，誤傷高；且濫用者刷出的 XP 對他人無傷 |
| 時間 variance bot 偵測（E 類）| Whale 習慣性定時發話，false positive 大；投入與收益不符 |
| 重複訊息內容偵測 | 「哈」「笑死」「+1」是群組日常，無法區分 |
| Sockpuppet 多帳號偵測（F 類）| LINE 無 device fingerprint，技術上做不到；影響有限（自刷自）|
| 試煉進度單日上限 | 試煉 debuff 全程作用，衝刺達標並未繞過挑戰；原本以為的「衝刺濫用」其實不存在 |
| 祝福 7「最小群組人數」下限 | 就算 2 人群組吃到 ×1.3，與他人無干；不值得加複雜度 |

**自然屏障已經夠用：**

- **Cooldown global per userId**（跨群共用）：已天然擋住「多群分散訊息規避冷卻」的 vector，`CHAT_TOUCH_TIMESTAMP_{userId}` 無 group 分片是**刻意設計**，不可改為 per-group
- **試煉 debuff 全程生效**：玩家無法「避開 debuff 期間刷 XP 再進試煉」，因為試煉條件只算試煉期內累積
- **60 天時限**：試煉期夠長讓 moderate 完成、夠短讓 whale 無法無限累積
- **祝福 trade-off 5 選 7**：頂配疊加本身已有天花板（見天花板驗算 ~3.35× gap）
- **邊際遞減 500+ tier 3%**：whale 單日暴力刷 XP 邊際收益極低

**系統哲學**：信任用戶、把偵測成本省下來做更有趣的設計。若未來真出現大規模亂象再重評。

舊系統全員歸零，進入新曲線。**採停機式大改版**（允許短時間維護窗口），不做 dual-run / 灰度。

**時程（建議）：**

- **T-14 / T-7 / T-3 / T-1**：逐次公告「將於 T-0 進行說話等級系統大改版」、說明新機制、說明先驅者成就資格截止時間
- **T-0 停機開始**：拉下說話等級相關服務（保留 LINE webhook 接收但不做 XP 計算），截取舊 `chat_user_data` 快照作為「先驅者」名單（Lv.100+ 或 XP > 8,407,860 的 82 人）
- **維護期間**（預估 1–2 小時）：
  - 執行遷移腳本：新 schema 建立、舊表停用（不 drop 以保留 rollback 空間）、先驅者成就寫入 AchievementEngine
  - 期間進入的 LINE 訊息**不計入 XP**（用戶體感為「機器人暫時不記聊天等級」）
- **T-0 + X 上線**：新系統啟動，所有玩家 `prestige_count = 0`、`current_level = 0`、享未轉生蜜月
- **T-0 + 7**：觀察期，每日檢查 `chat_exp_daily` 分層產速是否符合預估

**遷移內容：**

- **全員 XP / 等級重置為 0**。新曲線下 whale 約 7 天回到 Lv.50、heavy 約 20 天、moderate 約 45 天 — 回溫成本可接受
- **「先驅者成就」**（走 AchievementEngine）發放給舊系統 Lv.100+（或 XP > 8,407,860）之 82 位玩家；非稱號，僅成就紀念 + 獎勵
- 功能重構，不繼承舊 `chat_user_data` / `chat_level_title` / `chat_range_title` / `chat_exp_unit` 的 schema；新表另行設計，舊表移除前先停用
- 注意：舊 `chat_user_data.experience` 預設值是 **1**（非 0）、`rank` 預設 99999；新 schema 建議 experience 預設 0、rank 改 NULL 以減少 magic value

**Rollback 策略**：遷移腳本失敗或上線後短期（72h 內）發現重大 bug，可切回舊系統（舊表尚未 drop），需另備 rollback 腳本。

**無 admin 修補工具**：上線後若出現 XP 錯算、成就漏發等個案，統一用 **phpMyAdmin 手動修 DB** 處理，不做 Bot 端補償指令。常發性問題再考慮做專用工具。

⚠️ 先驅者資格以 **T-0 停機瞬間的資料快照** 為準，避免公告後刷等。

## DB Schema 詳細設計（2026-04-23 定稿）

9 張新表，全部採近期 2026 migration 慣例：snake_case、`user_id VARCHAR(33)` 直接存 LINE `platform_id`（不用 int FK 到 `user` 表）、`table.timestamps(true, true)` 作 created_at/updated_at、重要欄位 `.comment()`。

**設計原則拍板：**
- **JSON columns** 用於 config 表（`restriction_meta` / `reward_meta` / `effect_meta`）與 events modifiers：列少且 runtime 快取進記憶體，不需 SQL-level filter
- **UTC+8 日界線** 用於 `chat_exp_daily.date`（台灣玩家統一）
- **不加 FOREIGN KEY**：遷移 / staging 演練靈活，關聯寫在 `.comment()`
- **「每試煉只能通過一次」** app 層檢查（MySQL 不支援 filtered unique）；`chat_user_data.active_trial_id` 已限同時只能 1 個 active
- **30 天 retention** 用 cron `DELETE WHERE ts < NOW() - INTERVAL 30 DAY`（非 partition），足夠

**關鍵既有耦合**：`AchievementEngine.batchEvaluate` (app/src/service/AchievementEngine.js:360-362) 依賴舊 `chat_user_data.experience` JOIN `user.id` 查 `chat_100/1000/5000` 成就進度。遷移必須同步改寫為：
```js
mysql("chat_user_data").select("user_id", knex.raw("prestige_count * 27000 + current_exp as lifetime_exp"))
```

### 1. `chat_user_data`（核心狀態，舊表 DROP + CREATE）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `user_id` | VARCHAR(33) PK | LINE platform_id |
| `prestige_count` | TINYINT UNSIGNED, default 0 | 0–5，5 = 覺醒終態 |
| `current_level` | SMALLINT UNSIGNED, default 0 | 0–100 |
| `current_exp` | INT UNSIGNED, default 0 | 0–27000 |
| `awakened_at` | DATETIME NULL | prestige_count 到 5 時寫入 |
| `active_trial_id` | TINYINT UNSIGNED NULL | 目前挑戰中的試煉（NULL = 無）|
| `active_trial_started_at` | DATETIME NULL | 60 天期限倒數起點 |
| `active_trial_exp_progress` | INT UNSIGNED, default 0 | 試煉條件累積 |
| `created_at` / `updated_at` | | `table.timestamps(true, true)` |

索引：`INDEX (active_trial_id, active_trial_started_at)` / `INDEX (awakened_at)`

### 2. `chat_exp_unit`（XP 曲線 seed，101 列）

| 欄位 | 型別 |
|---|---|
| `unit_level` | SMALLINT UNSIGNED PK |
| `total_exp` | INT UNSIGNED NOT NULL |

Seed: `total_exp = round(2.7 × unit_level²)`，L=0→0, L=100→27000。

### 3. `prestige_trials`（試煉設定，5 列，data-driven）

| 欄位 | 型別 |
|---|---|
| `id` | TINYINT UNSIGNED PK (1–5) |
| `slug` | VARCHAR(30) UNIQUE NOT NULL |
| `display_name` | VARCHAR(20) NOT NULL |
| `star` | TINYINT UNSIGNED NOT NULL |
| `required_exp` | INT UNSIGNED NOT NULL |
| `duration_days` | TINYINT UNSIGNED, default 60 |
| `restriction_meta` | JSON NOT NULL |
| `reward_meta` | JSON NOT NULL |
| `description` | TEXT NULL |

**Seed 範例：**
```json
★1 departure:   restriction_meta={"type":"none"}                                    reward_meta={"type":"trigger_achievement","achievement_slug":"prestige_departure"}
★2 hardship:    restriction_meta={"type":"xp_multiplier","value":0.70}              reward_meta={"type":"permanent_xp_multiplier","value":0.10}
★3 rhythm:      restriction_meta={"type":"cooldown_shift_multiplier","value":1.33}  reward_meta={"type":"cooldown_tier_override","tiers":{"2-4":0.70,"4-6":0.90}}
★4 solitude:    restriction_meta={"type":"group_bonus_disabled"}                    reward_meta={"type":"group_bonus_double"}
★5 awakening:   restriction_meta={"type":"xp_multiplier","value":0.50}              reward_meta={"type":"permanent_xp_multiplier","value":0.15,"achievement_slug":"prestige_awakening"}
```

### 4. `prestige_blessings`（祝福設定，7 列，data-driven）

| 欄位 | 型別 |
|---|---|
| `id` | TINYINT UNSIGNED PK (1–7) |
| `slug` | VARCHAR(30) UNIQUE NOT NULL |
| `display_name` | VARCHAR(20) NOT NULL |
| `effect_meta` | JSON NOT NULL |
| `description` | TEXT NULL |

**Seed 範例：**
```json
1 language_gift:   {"type":"per_msg_xp_multiplier","value":0.08}
2 swift_tongue:    {"type":"cooldown_threshold_shift","from":6,"to":5}
3 ember_afterglow: {"type":"cooldown_tier_override","tiers":{"0-1":0.10,"1-2":0.30}}
4 whispering:      {"type":"diminish_tier_expand","tier":"0-200","to":300}
5 rhythm_spring:   {"type":"diminish_tier_expand","tier":"200-500","to":600}
6 star_guard:      {"type":"group_bonus_slope","value":0.025}
7 greenhouse:      {"type":"small_group_multiplier","threshold":10,"value":1.30}
```

### 5. `user_prestige_trials`（試煉 attempt 紀錄，append-only）

每列 = 一次挑戰；同一 trial 可能有多列（失敗 → 重挑 → 通過）。

| 欄位 | 型別 |
|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT PK |
| `user_id` | VARCHAR(33) NOT NULL |
| `trial_id` | TINYINT UNSIGNED NOT NULL |
| `started_at` | DATETIME NOT NULL |
| `ended_at` | DATETIME NULL |
| `status` | ENUM('active','passed','failed','forfeited'), default 'active' |
| `final_exp_progress` | INT UNSIGNED, default 0（結束時凍結）|
| `created_at` / `updated_at` | | |

索引：`INDEX (user_id, trial_id, status)` / `INDEX (status, ended_at)`

### 6. `user_blessings`（用戶已取得祝福）

| 欄位 | 型別 |
|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT PK |
| `user_id` | VARCHAR(33) NOT NULL |
| `blessing_id` | TINYINT UNSIGNED NOT NULL |
| `acquired_at_prestige` | TINYINT UNSIGNED NOT NULL | 取得時的新 prestige_count (1–5) |
| `acquired_at` | DATETIME NOT NULL, default NOW() |

索引：`UNIQUE (user_id, blessing_id)` / `INDEX (user_id)`

### 7. `chat_exp_daily`（每日聚合，永久保留）

| 欄位 | 型別 |
|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT PK |
| `user_id` | VARCHAR(33) NOT NULL |
| `date` | DATE NOT NULL | UTC+8 00:00 切日 |
| `raw_exp` | INT UNSIGNED, default 0 |
| `effective_exp` | INT UNSIGNED, default 0 |
| `msg_count` | INT UNSIGNED, default 0 |
| `honeymoon_active` | BOOLEAN, default FALSE |
| `trial_id` | TINYINT UNSIGNED NULL |
| `created_at` / `updated_at` | | |

索引：`UNIQUE (user_id, date)` / `INDEX (date)`

### 8. `chat_exp_events`（事件明細，30 天滾動）

| 欄位 | 型別 |
|---|---|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT PK |
| `user_id` | VARCHAR(33) NOT NULL |
| `group_id` | VARCHAR(33) NOT NULL |
| `ts` | DATETIME(3) NOT NULL | 毫秒精度 |
| `raw_exp` | SMALLINT UNSIGNED NOT NULL |
| `effective_exp` | SMALLINT UNSIGNED NOT NULL |
| `cooldown_rate` | DECIMAL(3,2) NOT NULL |
| `group_bonus` | DECIMAL(4,2) NOT NULL |
| `modifiers` | JSON NULL | 祝福/試煉/蜜月貢獻 debug |

索引：`INDEX (user_id, ts)` / `INDEX (ts)`（給 retention cron 用）

Retention：cron daily `DELETE FROM chat_exp_events WHERE ts < NOW() - INTERVAL 30 DAY`

### 9. `user_prestige_history`（轉生事件，永久保留）

| 欄位 | 型別 |
|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT PK |
| `user_id` | VARCHAR(33) NOT NULL |
| `prestige_count_after` | TINYINT UNSIGNED NOT NULL | 1–5 |
| `trial_id` | TINYINT UNSIGNED NOT NULL |
| `blessing_id` | TINYINT UNSIGNED NOT NULL |
| `cycle_started_at` | DATETIME NOT NULL | Lv.1 起算；首次 = T-0 遷移時 |
| `prestiged_at` | DATETIME, default NOW() |
| `cycle_days` | SMALLINT UNSIGNED GENERATED ALWAYS AS (DATEDIFF(prestiged_at, cycle_started_at)) STORED |

索引：`INDEX (user_id)` / `INDEX (prestige_count_after)`

### 舊表處理

| 舊表 | 動作 |
|---|---|
| `chat_user_data` | DROP + CREATE（欄位完全不同；遷移時先 rename → `chat_user_data_legacy_snapshot`，新表建好後驗證再 DROP rename 版本）|
| `chat_exp_unit` | DROP + CREATE（新曲線）|
| `chat_level_title` | DROP（整套稱號廢除）|
| `chat_range_title` | DROP |

## 需要變更的範圍（待規劃）

此 feature 為整個說話等級模組的重構，以下為預期影響面（非「改動既有」而是「新設計 + 取代舊系統」）：

- **DB（新）**：
  - 新 `chat_user_data`（用戶狀態：`prestige_count`、`current_level`、`current_exp`、`awakened` 等）
  - 新 `prestige_trials`（試煉設定，資料驅動：限制類型、XP 條件、時限、獎勵）
  - 新 `user_prestige_trials`（每用戶試煉進度與通過紀錄，含目前進行中的試煉期狀態）
  - 新 `prestige_blessings`（7 個祝福的設定，資料驅動：效果類型、數值）
  - 新 `user_blessings`（每用戶已選取的祝福，每筆紀錄對應一次轉生）
  - 新 `chat_exp_unit`（新曲線：平方律 `total = 2.7 × level²`, Lv.100 = 27K XP）
  - 新 `chat_exp_daily`（每用戶每日 XP 聚合：raw / effective / 當日 diminish 狀態 / 試煉期與蜜月 flag）— **永久保留，供長期分析**
  - 新 `chat_exp_events`（事件級明細：userId、groupId、timestamp、raw、effective、cooldownRate、groupBonus、bless/trial modifiers JSON）— **滾動保留 30 天，cron 自動 prune**
  - 新 `user_prestige_history`（每次轉生事件紀錄：時間、通過試煉、選擇祝福、循環耗時）— **永久保留**
- **移除**：舊 `chat_level_title`、`chat_range_title` 整套移除，**不再設計新稱號表**
- **EventDequeue**（改寫，維持輕量）：**不讀用戶狀態**。只存：
  - 原始間隔：從 `CHAT_TOUCH_TIMESTAMP_{userId}` 讀 lastTouchTS，把 `timeSinceLastMsg = now - lastTouchTS` 塞進事件
  - 群組人數：`groupCount`（沿用現行 `getGroupMemberCount` 快取）
  - 丟入 Redis list 的 payload：`{userId, groupId, timestamp, timeSinceLastMsg, groupCount}`（**不預算 cooldownRate，留給 ChatExpUpdate 依用戶 trial / blessing 狀態決定用 baseline 還是 ×1.33 表**）
  - 順便修 `CHAT_TOUCH_TIMESTAMP_{userId}` TTL bug：**5s → 10s**（舊值低於滿速門檻 6s，導致實際滿速門檻變成 5s，跟設計值不一致）
- **ChatExpUpdate**（改寫，邏輯中心）：每 1–5 分鐘批次 pop，讀用戶狀態快取後依時序套用：
  1. **cooldown 曲線**（讀 `active_trial_id`、`blessings[]` 決定：baseline / ×1.33 版（★3）/ 祝福 2、3 override）→ 以 `timeSinceLastMsg` 查表得 `cooldownRate`
  2. **單句 XP**：`base × cooldownRate × groupBonus × (1 + 祝福1)`（群組加成受祝福 6、7 影響）
  3. **日累計後套**：× 活動倍率 → × 蜜月 → diminish（邊界受祝福 4、5 影響）→ × 試煉當期倍率 → × (1 + 永久獎勵)
  4. 寫 DB（`chat_user_data` / `chat_exp_daily` / `chat_exp_events`），同步更新試煉 XP 條件進度、觸發完成事件
- **Redis 快取新增**：
  - `CHAT_USER_STATE_{userId}`：`prestige_count`、`blessings[]`、`active_trial_id`、`trial_start_ts`、`permanent_bonuses`；轉生 / 試煉事件主動失效
  - `CHAT_DAILY_XP_{userId}_{YYYY-MM-DD}`：當日累積原始 XP，TTL 36h，供 diminish tier 查詢
- **AchievementEngine 整合**：
  - 4 個隱藏 build 成就（疾風 / 洪流 / 溫度 / 孤獨），覺醒時檢查 `user_blessings` 組合觸發
  - 3 個 prestige milestone 成就（啟程 / 覺醒 / 先驅者），對應試煉完成與遷移事件
- **一次性遷移腳本 + rollback 腳本**：舊資料快照 → 新 schema；觸發「先驅者成就」給 82 位符合條件者；備 72h 回退窗口
- **Controller（精簡）**：只保留事件廣播觸發與狀態查詢指令，**所有轉生流程 UI 搬到 LIFF**。舊 admin 密技（`setExp` / `setExpRate`）可整串撤掉（不做新工具，有問題走 phpMyAdmin）
- **LIFF 頁面（新）**：轉生入口 CTA、試煉 5 選 1、祝福 7 選 1、試煉進度與 forfeit、覺醒者展示頁
- **試煉 lifecycle**：60 天時限倒數、XP 條件進度檢查、完成/失敗狀態轉換（均不主動通知，只在 LIFF 可見）
- **群組廣播基礎架構**（獨立子系統，見上方專章）：
  - `saveReplyToken` 重寫：sorted set、TTL 55s、source regex `[CUDR]`、保留最新 5 個
  - 新 Redis key：`REPLY_TOKEN_QUEUE_{sourceId}`（sorted set）、`BROADCAST_QUEUE_{groupId}`（list，24h TTL）
  - EventDequeue 消費 broadcast queue（事件驅動路徑 A）
  - 新 cron job：broadcast queue drainer（每 30s 跑，備援路徑 B）
  - Broadcast API wrapper：封裝 `pullFreshToken` + reply，失敗時 `LPUSH` 回 queue
- **群組廣播事件**：進入試煉、試煉通過、轉生完成、覺醒達成（內容見「群組可見性」章節）
- **前端 Rankings 頁面**：顯示等級、轉生次數、覺醒者標記、祝福 build（**無稱號欄位**）
- **新 cron jobs**：
  - `chat_exp_events` 30 天 retention prune（每日）
  - Broadcast queue drainer（每 30 秒）

## 觀察性指標（系統上線後可追蹤）

舊系統只留終身 `experience`，完全沒有時間軸、群組分布、修正來源拆解。新系統透過 `chat_exp_daily` / `chat_exp_events` / `user_prestige_history` 可以回答許多過去拿不到的問題，對平衡微調與營運洞察都是一次升級。

### 從 `chat_exp_daily` 可萃取（永久保留）

- **分層日產出演進**：moderate / heavy / whale 三層的**實際**日均 XP 隨時間漂移 — 驗證 diminish 是否生效、試煉是否讓產速趨平
- **節奏驗證**：moderate 是否真的 ~180 天完成第一次 Lv.1→100？★5 是否真的 ~67 天達標？實測值 vs 預估值
- **蜜月影響**：`prestige_count = 0` 族群 vs 首次轉生後的次日產出差距是否自然
- **留存 / 流失**：累計 N 天未產 XP 的玩家比例（用 `MAX(date)` 判斷流失）
- **跨群組活躍度**：配合 `chat_exp_events` 的 `groupId`，看玩家是否主要活躍在某一兩個群、還是分散多群

### 從 `chat_exp_events` 可萃取（30 天滾動）

- **單日高峰**：哪個時段發話最密集、cooldown 壓抑比例
- **群組人數 vs XP 分布**：驗證 ★4 / 祝福 7 的平衡性
- **修正堆疊分布**：事件級拆解「這筆 XP 的祝福貢獻 / 試煉貢獻 / 蜜月貢獻」，debug 用戶申訴好用
- **異常偵測**：爆發性 burst 模式 / 單一群組壟斷現象 / cooldown bypass 嘗試

### 從 `user_prestige_history` 可萃取（永久保留）

- **試煉挑戰偏好**：首次轉生大家最常挑哪個試煉？★1 / ★5 比例？社群 meta 的成形觀察
- **祝福 build 分布**：7 祝福各自被選的比例、典型組合（驗證 trade-off 設計是否成功）
- **循環耗時**：實測每次 Lv.1→100 + 試煉的總天數，校準未來擴充內容的節奏
- **覺醒漏斗**：多少人走到 ★1→★2→...→覺醒？在哪一關卡關最多？
- **隱藏成就觸發率**：4 個 build 成就（疾風 / 洪流 / 溫度 / 孤獨）各自多少人達成？

### 運維查詢範例

- 「這個玩家為什麼今天 XP 特別少？」→ `chat_exp_events` 撈當日明細，看 cooldown / diminish / 試煉懲罰各拆了多少
- 「★5 是否太難？」→ `user_prestige_history` 看 ★5 試煉挑戰次數 / 通過率 / 平均嘗試次數
- 「某次活動是不是過度拉高 whale？」→ `chat_exp_daily` 看活動前後 whale 層實際產出變化
- 「新玩家體驗如何？」→ `prestige_count = 0` 族群的首 30 天留存率 + 等級分布

## 群組廣播基礎架構（reply token queue）

由於「不使用 LINE Push API」的硬原則，所有系統訊息都必須走 reply token 才能送到群組。現行 `saveReplyToken`（`app/bin/EventDequeue.js`）只留最新 1 個、TTL 20s，不足以支撐「非同步事件觸發的廣播」（試煉通過 / 轉生 / 覺醒 / 未來活動）。這次大改版順便重建此機制。

### Reply token 儲存：sorted set

舊版單一 `Redis.set` 改成 sorted set，每個 sourceId 保留最新 5 個、TTL ~55s：

```
Key:    REPLY_TOKEN_QUEUE_{sourceId}
Type:   sorted set
Score:  unix millisecond timestamp
Value:  reply token 字串
```

**寫入**（每則 webhook 進來時）：

```
ZADD REPLY_TOKEN_QUEUE_{sourceId} <now> <token>
ZREMRANGEBYRANK REPLY_TOKEN_QUEUE_{sourceId} 0 -6           # 只保留最新 5 個
ZREMRANGEBYSCORE REPLY_TOKEN_QUEUE_{sourceId} 0 <now-55000> # 清超過 55s
```

**消費**（要發廣播時）：

```
ZRANGEBYSCORE ... <now-55000> +inf LIMIT 0 1 REV  # 取還沒過期的最新一個
ZREM ... <取到的 token>                            # 消耗即移除，避免 double-use
```

**順便修的蒐集 bug**：

- source 正則 `[CUD]` → `[CUDR]`（把 room 納入；`D` 可能是 typo，但保守起見保留）
- TTL 20s → 55s（對齊 LINE 官方 token 有效期）
- 舊版每次新訊息覆蓋掉舊 token，新版自動汰換但保留最新 5 個

### 廣播 queue：事件 → 消費

```
Key:    BROADCAST_QUEUE_{groupId}
Type:   list
Value:  JSON { type, text, payload, createdAt }
TTL:    24 小時（Redis EXPIRE 刷新）
```

**寫入**（ChatExpUpdate 批次算出 trigger 時）：

```
LPUSH BROADCAST_QUEUE_{groupId} <JSON>
EXPIRE BROADCAST_QUEUE_{groupId} 86400   # 每次寫入重置 24h
```

**消費路徑**（兩條，互補）：

**(A) Event-driven（主要路徑）**：該群下一則訊息進 EventDequeue 時：
1. 正常處理 XP
2. 檢查 `BROADCAST_QUEUE_{groupId}` 有沒有項目
3. 有的話 pull fresh token + 一次 reply 最多 5 則（LINE reply API 上限）
4. `LPOP` 已送出的項目

**(B) Scheduled drainer（備援路徑）**：cron 每 30s 掃所有 `BROADCAST_QUEUE_*`：
1. 對有 queue 的 groupId 嘗試 `pullFreshToken`
2. 拿得到就發（同 A 流程）
3. 拿不到就放著，等下個 30s 或等 24h TTL 自動失效

**優先 (A)** 的理由：event-driven 不需 polling，免費拿到最新 token。(B) 只負責收尾「已 queue 很久、但沒人觸發 EventDequeue 消費」的殘留項目。

### 失敗與邊界情況

- **群組靜默 24h 以上**：queue 自然過期被 drop，廣播預期地失蹤（反正沒觀眾）
- **LINE reply API 失敗**：retry 一次；仍失敗則 `LPUSH` 回 queue 開頭、等下次機會
- **Token 用到一半過期**：reply API 會回錯，當作失敗處理，fallback 到其他 token 或 queue 回去
- **同批多廣播**：最多 batch 5 則進一次 reply；超過的留在 queue 等下次消費

### 為什麼一起做

- 沒有這個機制，試煉通過 / 轉生 / 覺醒的廣播根本發不出去（文字在 spec 裡沒法落地）
- 架構跟說話等級的 EventDequeue 同一條路徑，一起改動線性最省
- 未來活動系統 v2 的「活動開始 / 結束」廣播可以直接復用，不須再造輪

## 資料快照（2026-04-23）

**舊系統等級分布：**

| 指標 | 數值 |
|---|---|
| 總用戶數 | 23,070 |
| 平均等級 | 16.9 |
| Level 100 以上 | 82 人 |
| Level 150 以上 | 7 人 |
| 已達現行上限 (173) | 1 人 |
| Level 100 所需 XP | 8,407,860 |
| Level 173 所需 XP | 47,208,820 |

**終身日均 XP 分層**（22,131 位有 `created_at` 的用戶）：

| Bucket | XP 區間 | 人數 | 平均日均 XP | 最高日均 XP | 平均帳齡（天）|
|---|---|---|---|---|---|
| inactive | = 0 | 30 | 0 | 0 | 1,993 |
| casual | < 10K | 13,791 | 2 | 1,522 | 1,679 |
| light | < 100K | 5,085 | 26 | 2,141 | 1,708 |
| moderate | < 500K | 1,989 | 150 | 3,874 | 1,741 |
| heavy | < 2M | 858 | 656 | 30,922 | 1,769 |
| whale | ≥ 2M | 408 | 3,760 | 29,474 | 1,830 |

**日均 XP 分位數**（僅活躍 n=22,131）：

| p50 | p75 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|
| 2 | 20 | 128 | 381 | 2,356 | 30,922 |

**Lv.100+ 玩家特徵（82 人，是覺醒系統的核心受眾）：**

- 最卷：49.7M XP / 2,037 天 ≈ 24,412 XP/日
- 多數落在 10,000–20,000 XP/日 區間
- 其中 6 位是 1,226 天帳齡的「第二梯次」老玩家，其餘 2,037 天為初代

**現行 XP 機制（`app/bin/EventDequeue.js:handleChatExp`）：**

- 冷卻（全局 per userId，跨群共用）：<1s 0% / 1–2s 10% / 2–4s 50% / 4–6s 80% / ≥6s 100%
- 群組人數加成：<5 人為 1.0×，≥5 人為 `1 + (count-5) × 0.02`（30 人 = 1.5×）
- 基礎 XP `globalRate`：預設 **90 / 則**（可熱調整，存 Redis `CHAT_GLOBAL_RATE`）
- 每則 XP = `round(addition × rate × globalRate / 100)`
