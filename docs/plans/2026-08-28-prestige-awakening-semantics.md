# 轉生「覺醒」語意現況說明

**日期**：2026-08-28
**狀態**：現況紀錄（非規劃文件）

`docs/plans/chat-level-prestige*.md` 是 2026-04 的規劃文件，記錄當時的設計決定，**不會回頭改寫**。這支文件說明那批文件裡的一個假設在實作後脫鉤了，以及現行 code 的真實語意。

## 一句話

「覺醒」在這個系統裡有**兩個不同的東西**，當初的設計假設它們是同一件事：

| | 是什麼 | 觸發條件 | 線上人數 |
|---|---|---|---|
| `prestige_awakening`（成就） | ★5 試煉「覺悟」的通關證明 | 通過 ★5 試煉 | **55** |
| `prestige_count = 5`（狀態） | 轉生封頂的終態 | 累計完成 5 次轉生 | **2** |

規劃文件寫的是「★5 = 第 5 次轉生」，所以只設計了一個成就。實際上兩者可以差很遠。

## 為什麼會脫鉤

試煉是 **opt-in 且不強制按星級順序**，玩家可以自由挑要打哪一關。而 ★5 的門檻定價失衡：

| star | slug | display_name | required_exp | 通過人數 |
|---|---|---|---|---|
| 1 | departure | 啟程 | 10000 | 65 |
| 2 | hardship | 刻苦 | 9000 | 26 |
| 3 | rhythm | 律動 | 12500 | 10 |
| 4 | solitude | 孤鳴 | 12500 | 15 |
| **5** | **awakening** | **覺悟** | **10000** | **55** |

★5「覺悟」只要 10000 XP，比 ★3 律動 / ★4 孤鳴 的 12500 還便宜。玩家自然挑最划算的打，於是 ★5 通過人數（55）遠高於 ★3（10）和 ★4（15）。

通過 ★5 只代表「打完那一關試煉」，跟轉生次數無關 —— 轉生要另外消耗一個已通過未使用的試煉才會 +1。

線上 `prestige_count` 分布（2026-08-28）：

| prestige_count | 人數 |
|---|---|
| 0 | 22305 |
| 1 | 12 |
| 4 | 1 |
| 5 | **2** |

## 現行 code 的真實語意

**`prestige_awakening` — ★5 試煉通關證明**

`PrestigeService.js:230-233` 在任何試煉通過時讀 `trial.reward_meta.achievement_slug` 發放。★5「覺悟」的 `reward_meta` 帶 `achievement_slug: "prestige_awakening"`，所以是那一關的通關獎勵，與 `prestige_count` 無關。

`PrestigeService.js:185` 把它的獎勵文案顯示為「覺醒之證」—— 證明，不是狀態。

**`prestige_5`「輪迴盡頭」— 真正的轉生終態**（2026-08-28 新增，PR #805）

`AchievementEngine.js:110` 掛在 `prestige_complete` 事件，`:249` 用 `STRATEGIES.threshold(..., "prestigeCount", 5)` 判定。這才是「累計 5 次轉生」。

命名刻意避開「覺醒」二字，因為那個詞已被 `prestige_awakening` 佔用，兩者必須能區分。

**門檻 5 為什麼寫在 code 而非 DB `condition`**

`prestige_3` 的門檻放在 DB（數值機密），但 5 不是機密 —— `Lv100CTA.js:34` 本來就對玩家顯示「累計 5 次轉生 → 覺醒終態（封頂）」，`PrestigeService.js:16` 的 `PRESTIGE_CAP = 5` 也在 git 裡。

若比照 `prestige_3` 留 NULL condition 走 `conditionThreshold`，`AchievementEngine.js:132-137` 在 `minValue === undefined` 時會直接回傳原值，導致 fresh DB 上永不解鎖。故改用 `STRATEGIES.threshold` 硬寫 5。

未 `import PRESTIGE_CAP`：`PrestigeService` 已 require `AchievementEngine`，反向 import 會循環依賴。

## 讀舊規劃文件時的對照

`docs/plans/chat-level-prestige*.md` 裡大量出現的「覺醒」，**絕大多數指的是 `prestige_count = 5` 的遊戲終態概念，那些敘述仍然正確** —— 包括封頂規則、祝福鎖定、`✨ 覺醒者` 狀態顯示、覺醒廣播、build 成就檢查。

只有把成就 `prestige_awakening` 綁到「第 5 次轉生」的敘述是錯的。已在對應位置加註：

- `chat-level-prestige-impl.md:164`
- `chat-level-prestige-acceptance.md:83`

`chat-level-prestige-m5.md:141`（「★5 trial 通過 → `unlockByKey("prestige_awakening")`」）**沒有錯**，它描述的正是現行行為。

## 已知未決

**★5 定價失衡**：`required_exp = 10000` 低於 ★3/★4 的 12500，導致玩家跳過中段直攻 ★5。是否調整尚未討論 —— 若調，會影響既有 55 名通過者的觀感。

**55 vs 2 的落差**：目前無計畫回收或重發 `prestige_awakening`。舊成就零改動，55 名持有者不受影響。
