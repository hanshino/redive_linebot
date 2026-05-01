# M5 — AchievementEngine 整合

**目的**：接入 7 個新成就，讓 M3 的 trial pass / prestige 流程真的發獎；同時改寫 `AchievementEngine.batchEvaluate` 讓 `chat_100 / 1000 / 5000` 依「終身 XP」而非被重置清零的 `current_exp` 判定。

**依賴**：M1（schema）、M3（PrestigeService 觸發點已備妥 hook 位置）。

**Branch**：`feat/clp-m5` off `feat/chat-level-prestige`。

---

## 背景

M3 結束時：
- `PrestigeService.checkTrialCompletion` 已把試煉標記為 passed 並推 `trial_pass` 廣播事件，但**沒有**打 `AchievementEngine`。
- `PrestigeService.prestige` 在第 5 次時推 `awakening` 廣播事件，也**沒有**打 `AchievementEngine`。
- M3 頂部註解留下 TODO：ach trigger 屬 M5 範圍。

`prestige_trials` seed 的 `reward_meta` 已經明示哪些試煉要觸發成就：
```js
★1 departure:  reward_meta={type:"trigger_achievement", achievement_slug:"prestige_departure"}
★5 awakening:  reward_meta={type:"permanent_xp_multiplier", value:0.15, achievement_slug:"prestige_awakening"}
★2/★3/★4:      沒有 achievement_slug
```
讀 `reward_meta.achievement_slug` 比 hardcode star 值通用——後續調 trial 設計不必改 service 程式。

`AchievementEngine.batchEvaluate` 在 `app/src/service/AchievementEngine.js:360-362` 現寫：
```js
.join("user", "chat_user_data.id", "user.id")
.select("user.platform_id", "chat_user_data.experience");
```
新 schema 沒 `experience` 欄位了（重命名為 `current_exp`），且轉生後 `current_exp` 會歸零——必須改用 `prestige_count * 27000 + current_exp` 做「終身 XP」。

## 拍板的設計決策

1. **觸發點資料驅動**：Trial achievement 由 `trial.reward_meta.achievement_slug` 決定，不在 service 裡 hardcode 星等 → achievement key 對應表。這樣 M9 遷移腳本只需塞資料進 DB，不用碰程式。
2. **`AchievementEngine.unlockByKey(userId, key)`**：新增 public helper。跳過 `calculateProgress` / strategy map（那是 event-driven 的 evaluate 才會用），直接 idempotent unlock：
   - cache 裡找不到 key → log warn 且 no-op
   - 已 unlocked → no-op
   - 否則呼內部 `unlockAchievement`（既有私有函式，發石頭 + 寫 `user_achievements`）
3. **Build 成就檢查時機**：只在**第 5 次** prestige（`newPrestigeCount === PRESTIGE_CAP`）觸發，位置在寫完 `user_blessings` 與廣播事件之後。理由：前 4 次玩家還可能換 build，沒意義；第 5 次 build 鎖定，可一次性結算。
4. **Build 組合定義**（blessing id 對應 seed 的 1–7）：
   - `blessing_breeze`（疾風）：組內有 **2 AND 3**（swift_tongue + ember_afterglow 冷卻雙修）
   - `blessing_torrent`（洪流）：組內有 **4 AND 5**（whispering + rhythm_spring 遞減雙修）
   - `blessing_temperature`（溫度兼融）：組內有 **6 AND 7**（star_guard + greenhouse 大小群雙修）
   - `blessing_solitude`（孤獨）：組內**不含 6**（放棄大群 star_guard）
   
   這 4 條互不排他，單一玩家可同時拿到多個（例：build = 2+3+4+5+7 → breeze + torrent + solitude）。
5. **錯誤隔離**：成就觸發失敗**不** throw。`AchievementEngine.unlockByKey` 自己 try/catch + log，不讓轉生流程 rollback。理由：廣播/獎勵是副作用，比試煉狀態本身次要。
6. **`batchEvaluate` 改寫**：
   ```sql
   SELECT user_id, (prestige_count * 27000 + current_exp) AS lifetime_exp
   FROM chat_user_data
   ```
   不再 JOIN `user` 表，因為新 `chat_user_data.user_id` 已是 platform_id（string）。`chatUsers` 改為 `{user_id, lifetime_exp}` 結構。
7. **Seed 位置**：新 migration 而非改 `20260416074756_seed_achievement_data.js`。理由：那筆 seed 在正式環境已跑過，migration 不可逆回編輯。

---

## 任務

### M5.1 — Seed migration（7 條新成就）

新 migration：`2026XXXX_seed_prestige_achievements.js`

歸類 category：`chat`（試煉/祝福本質是 chat 系統的延伸），不新增 category。

| key | name | icon | type | rarity | target | stones | notify |
|---|---|---|---|---|---|---|---|
| prestige_departure | 啟程 | 🌱 | milestone | 1 | 1 | 100 | ✓ |
| prestige_awakening | 覺醒 | ✨ | milestone | 3 | 1 | 500 | ✓ |
| prestige_pioneer | 先驅者 | 🏛️ | hidden | 3 | 1 | 500 | ✓ |
| blessing_breeze | 疾風之道 | 🌬️ | hidden | 2 | 1 | 200 | ✓ |
| blessing_torrent | 洪流之道 | 🌊 | hidden | 2 | 1 | 200 | ✓ |
| blessing_temperature | 溫度兼融 | 🌡️ | hidden | 2 | 1 | 200 | ✓ |
| blessing_solitude | 孤獨之道 | 🏝️ | hidden | 2 | 1 | 200 | ✓ |

`order` 直接接在 chat 類既有最大 order 之後（order 6–12）。

### M5.2 — `AchievementEngine.unlockByKey`

```js
exports.unlockByKey = async (userId, key) => {
  try {
    const cache = await getCache();
    const achievement = cache.find(a => a.key === key);
    if (!achievement) {
      DefaultLogger.warn(`AchievementEngine.unlockByKey: unknown key=${key}`);
      return { unlocked: false, reason: "unknown_key" };
    }
    if (!isEligible(userId, achievement)) {
      return { unlocked: false, reason: "ineligible" };
    }
    const unlockedIds = await UserAchievementModel.getUnlockedIds(userId, [achievement.id]);
    if (unlockedIds.has(achievement.id)) {
      return { unlocked: false, reason: "already_unlocked" };
    }
    await unlockAchievement(userId, achievement);
    return { unlocked: true, achievement };
  } catch (err) {
    DefaultLogger.error(`AchievementEngine.unlockByKey error for ${key}:`, err);
    return { unlocked: false, reason: "error" };
  }
};
```

**測試**：已 unlocked no-op、unknown key no-op + warn、success path 呼 `UserAchievementModel.unlock` + 發石頭、error path 吞掉不 throw。

### M5.3 — 改寫 `batchEvaluate`

`AchievementEngine.js:360-362`：
```js
// 舊：
const chatUsers = await mysql("chat_user_data")
  .join("user", "chat_user_data.id", "user.id")
  .select("user.platform_id", "chat_user_data.experience");

// 新：
const chatUsers = await mysql("chat_user_data")
  .select(
    "user_id",
    mysql.raw("prestige_count * 27000 + current_exp AS lifetime_exp")
  );
```

迴圈裡 `user.platform_id` → `user.user_id`、`user.experience` → `user.lifetime_exp`。

**測試**：batchEvaluate mock knex 回傳 `[{user_id, lifetime_exp}]` → upsert + unlock 被正確呼叫。

### M5.4 — Hook PrestigeService.checkTrialCompletion

在 broadcast push 之後：
```js
const achievementSlug = trial?.reward_meta?.achievement_slug;
if (achievementSlug) {
  await AchievementEngine.unlockByKey(userId, achievementSlug);
}
```

**測試**：
- ★1 trial 通過 → `unlockByKey("prestige_departure")` 被呼叫
- ★5 trial 通過 → `unlockByKey("prestige_awakening")` 被呼叫
- ★2/★3/★4 通過 → `unlockByKey` **不**呼叫
- `unlockByKey` 拋錯 → 流程仍回傳 `{completed: true}` (錯誤被吞)

### M5.5 — Hook PrestigeService.prestige（第 5 次的 build 檢查）

在 `if (awakened)` 區塊內、`awakening` 廣播之後：
```js
if (awakened) {
  await broadcastQueue.pushEvent(groupId, { type: "awakening", ... });
  const finalBlessingIds = await UserBlessing.listBlessingIdsByUserId(userId);
  await evaluateBuildAchievements(userId, finalBlessingIds);
}
```

`evaluateBuildAchievements` 放同檔案下私有 helper（或 `PrestigeAchievementService.js` 獨立檔——依測試方便）。

邏輯：
```js
const set = new Set(blessingIds);
const matches = [];
if (set.has(2) && set.has(3)) matches.push("blessing_breeze");
if (set.has(4) && set.has(5)) matches.push("blessing_torrent");
if (set.has(6) && set.has(7)) matches.push("blessing_temperature");
if (!set.has(6)) matches.push("blessing_solitude");
for (const key of matches) {
  await AchievementEngine.unlockByKey(userId, key);
}
```

**測試**（以 blessing id set 為輸入）：
- `{1,2,3,4,5}` → breeze + torrent + solitude
- `{1,2,3,6,7}` → breeze + temperature
- `{4,5,6,7}` → torrent + temperature（非覺醒情境也不該跑，但 helper 本身要對組合正確判斷）
- `{1,2,4,5,7}` → torrent + solitude（不含 6）
- 第 4 次轉生（awakened=false）→ helper **不**被呼叫

### M5.6 — Integration test

`PrestigeService.integration.test.js` 加：
- `startTrial` → 灌 XP → `checkTrialCompletion` 驗證 `unlockByKey` 被以正確 slug 呼叫
- 第 5 次 `prestige` 驗證 build 成就被評估（以既有 `UserBlessing.listBlessingIdsByUserId` 回傳值決定）

### M5.7 — Merge back

- `yarn test` 全綠（允許既有 `images.test.js` pre-existing failure）
- `yarn lint` clean
- `git checkout feat/chat-level-prestige && git merge --no-ff feat/clp-m5`

---

## Exit Criteria

- [ ] ★1 / ★5 試煉通過後自動發成就（含石頭獎勵）
- [ ] 第 5 次轉生（覺醒）自動結算 4 個 build 成就
- [ ] `AchievementEngine.batchEvaluate` 用終身 XP（`prestige_count × 27000 + current_exp`）判定 chat_100/1000/5000
- [ ] 成就觸發失敗**不**讓轉生流程 rollback
- [ ] `yarn test` 新增測試全綠、既有測試零回歸
- [ ] `yarn lint` clean

## Non-goals（延後）

- `prestige_pioneer` 實際發放給 82 位舊玩家（M9 遷移腳本責任，這裡只塞定義）
- Award notification 中文模版細修（可用 `notify_message` 欄位但不必硬塞，預設 "已解鎖成就：{icon} {name}" 夠用）
- 多語系（專案整體尚未 i18n）
