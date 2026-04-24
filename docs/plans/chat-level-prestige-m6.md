# M6 — LIFF 前端

**目的**：5 個轉生頁面 + Rankings 增補，把 M1–M5 已完成的 service 與 data 透過 LIFF 介面開放給玩家。

**依賴**：M3（PrestigeService 方法全備）、M5（成就觸發點已接，前端不用再插 hook）。

**Branch**：`feat/clp-m6` off `feat/chat-level-prestige`。

**平行性**：M6 可與 M7（Controller 精簡）並行。M7 拔掉 `setExp` 等 admin 指令跟 LIFF 無關聯。

**UI review 狀態**：已經過 ui-ux-pro-max 規則集 review 並套用所有 HIGH/MEDIUM 修正（見每節 ✅/⚠️ 註記）。

---

## 背景

`PrestigeService` 已暴露 4 個 public API：

| method | 用途 |
|---|---|
| `getPrestigeStatus(userId)` | 回傳整份 status payload（state machine 所需全部欄位） |
| `startTrial(userId, trialId)` | 進入試煉（會檢 `prestige_count >= 5` / `active_trial_id` / `已通過` / `trial 存在` 四道 guard） |
| `forfeitTrial(userId)` | 放棄當前試煉（會檢 `NO_ACTIVE_TRIAL`） |
| `prestige(userId, blessingId)` | 消耗一個已通過未消費的 trial + 選一個未取祝福 → 完成轉生；第 5 次觸發覺醒 |

全部會丟 `Error` with `.code`（實際 service 碼：`AWAKENED` / `NOT_LEVEL_100` / `ALREADY_ACTIVE` / `ALREADY_PASSED` / `INVALID_TRIAL` / `NO_ACTIVE_TRIAL` / `NO_PASSED_TRIAL` / `INVALID_BLESSING` / `BLESSING_ALREADY_OWNED`）——API 層要把這些 code 對回 HTTP status + 中文 message。

前端既有基礎建設（**不需要重做**）：
- `LiffProvider` 已處理 LIFF SDK init、token 取得、`/api/me` profile 拉取。
- `useLiff()` hook 提供 `{ready, loggedIn, profile, login}`。
- `/liff/:size/*` route 解析 size 後 redirect 到實際 path；直接存取 `/prestige` 等 browser 路徑也會 fallback 到 stored token 的 fast path。
- `AlertLogin` 組件（`components/AlertLogin.jsx`）用於未登入 fallback。
- `api` axios（`services/api.js`）已自動帶 `Authorization: Bearer <token>`，401/403 會自動清 token + 導回首頁。

`getPrestigeStatus` 現在會 drop `description` 欄位（`PrestigeService.js:326-346` 的 map），M6 要補回去——讓 UI 不用 hardcode 試煉/祝福介紹文字。

## 拍板的設計決策

### 1. 單一「/prestige」入口 + state-aware routing

不做 5 個獨立 top-level route。統一用 `/prestige` 一頁作為狀態機總入口，**依 `getPrestigeStatus` 回傳決定該 render 哪個子 view**：

```
/prestige   →  Prestige.jsx (主入口 dispatcher)
             ├─ <Lv.100, 無 active_trial 無 unconsumed_passed   → LevelClimbView
             ├─ <Lv.100, 有 active_trial                         → LevelClimbView + 試煉進度側卡
             ├─ Lv.100, 無 active, 無 passed                     → TrialSelectView
             ├─ Lv.100, active                                   → TrialProgressView
             ├─ Lv.100, 無 active，有 passed 未消費              → BlessingSelectView
             └─ awakened (prestige_count = 5)                    → AwakenedView
```

**理由**：state machine 由 server 驅動；玩家不應該能手動導到與當前狀態不符的頁面（例如「已覺醒」卻看得到 TrialSelect 讓他按按鈕再吃一個 409）。統一 dispatcher 讓後端是唯一真實來源。

**實作**：6 個頁面組件改為同檔案下的 5 個 view sub-component，`Prestige.jsx` 根據 status 決定 render 哪一個。5 個 subview 不佔 route，資料只從 props（status）走。

**URL**：所有狀態都在 `/prestige`。刷新網址永遠回 dispatcher，根據最新 status 重派頁。LIFF deep link 只需配置一個：`line://app/{LINE_LIFF_ID}?path=/prestige`。

### 2. Mobile-first LIFF 優先，desktop 可讀即可

- Container `maxWidth="sm"`（與 Janken 一致），padding `py: 3`
- Grid 用 `xs=12 sm=6`（trial/blessing 卡）— LIFF compact size ≈ 320px 寬，一排一張；tall/full size 一排兩張
- 字級、icon 尺寸以手機可見為準，desktop 看會留白但不會破版
- 所有互動按鈕最小觸控面積 44×44px、相鄰觸控元素間 gap ≥ 8px（Pro Max HIGH）
- `readable-font-size`：body 至少 16px、secondary 14px，**不得低於 12px**（0.75rem）

### 3. MUI v7 + Emotion，風格對齊既有頁面

| 參考頁面 | 借用元素 |
|---|---|
| `pages/Achievement/index.jsx` | Avatar + 中央 headline + LinearProgress + rarity card grid + Tabs filter + **純 MUI icon（禁 emoji）** |
| `pages/Rankings/index.jsx` | Paper 卡片 + Tabs + overview cards（4 欄頂端統計） |
| `pages/Janken/index.jsx` | Container sm + 分區 Divider + 側邊 CTA |

**不自創新色票**。試煉 ★ 配色用 MUI palette，**色+文字雙編碼**避免色盲盲點（Pro Max `color-only` HIGH）：

| 星 | color | tier label（必顯） | 語意 |
|---|---|---|---|
| ★1 | `success.main`（綠） | 初階 | 啟程 |
| ★2 | `info.main`（藍） | 中階・負擔 | 刻苦 |
| ★3 | `warning.light`（黃） | 中階・律動 | 律動 |
| ★4 | `warning.main`（橘） | 高階・孤鳴 | 孤鳴 |
| ★5 | `secondary.main`（紫）⚠️ 改色 | 最終試煉 | 覺悟（紅色在 MUI 映射「錯誤」— 改紫色呼應 awakened gradient 起點） |
| 覺醒 | linear-gradient `#6c5ce7 → #d63384` | ✨ 覺醒者 | 終態 glow |

所有 tier label **必須與顏色同顯**，不得只靠色區分。

### 4. 確認 dialog 強制二次確認（不可逆動作）

三個不可逆動作必走 `components/AlertDialog.jsx`。按鈕 label 必含**具體 action target** 讓使用者在按下前再次確認自己要的是哪一個（Pro Max `confirmation-dialogs` HIGH）：

1. **開始試煉** — warning 級
   - 內容：60 天時限 + 限制內容 + 放棄代價
   - 按鈕：`[取消] [確認挑戰 ★3 律動]` ← 含星等+名稱
2. **放棄試煉** — error 級
   - 內容：「當前已累積 XP 保留在等級，但試煉進度歸零」
   - 按鈕：`[取消] [確認放棄 ★3]`
3. **選擇祝福（前 4 次）** — warning 級
   - 內容：「此選擇永久鎖定不可重選」
   - 按鈕：`[取消] [選擇「語言天賦」並轉生]`
4. **選擇祝福（第 5 次 / 最終）** — warning 級 + **鎖定 friction**
   - 內容：同上 + 「完成後將進入覺醒終態」
   - **額外欄位**：要求輸入祝福中文名才能啟用 primary button（仿 GitHub 刪 repo 體驗）
   - 按鈕：`[取消] [確認覺醒] (disabled until 輸入 "語言天賦")`

**不做「undo 隊列」**：3s 等待 toast 再 commit 不適合 LIFF，玩家切出 app toast 就消失。直接 dialog 確認是最穩的。

### 5. 錯誤處理統一用 HintSnackBar

既有 `components/HintSnackBar.jsx` + `hooks/useHintBar.js` 已是專案既定模式。所有 mutation 失敗用它顯示紅色 snack（對應 HTTP error code → 中文訊息）。

API error → 中文映射表（service layer 統一處理）：

| code | 訊息 |
|---|---|
| `AWAKENED` | 已達覺醒狀態，無法再轉生 |
| `NOT_LEVEL_100` | 需先達到 Lv.100 才能轉生 |
| `ALREADY_ACTIVE` | 已有進行中的試煉 |
| `ALREADY_PASSED` | 該試煉已通過 |
| `INVALID_TRIAL` | 試煉不存在 |
| `NO_ACTIVE_TRIAL` | 目前沒有進行中的試煉 |
| `NO_PASSED_TRIAL` | 請先通過一個試煉 |
| `INVALID_BLESSING` | 祝福不存在 |
| `BLESSING_ALREADY_OWNED` | 已擁有此祝福 |
| 其他 | 系統暫時無法處理，請稍後再試 |

### 6. Polling over Socket.IO（v1）⚠️ 更新週期 + 錯誤處理

M6 規格把 Socket.IO 列為選配。**v1 不做 socket**，改在 Prestige dispatcher：

- Mount 時 GET `/api/prestige/status`
- 如果 `activeTrial !== null`：**每 60s** 重拉 status（原 30s 改 60s：trial XP 累積慢，日均 150 XP 分佈於 24h，30s 看不到變化、徒增 API 負擔）
- `visibilitychange` → hidden 停 poll；visible 立即重拉 + 恢復 poll
- `focus` event trigger 立即拉一次（切回瀏覽器 tab 時保證最新）
- Mutation 成功 → 立即重拉 status（不等下一輪 poll）
- **倒數計時獨立於 status poll**：用 client-side `setInterval(60_000)` 本地計算 `expiresAt - now`，不需打 API
- **Polling 失敗處理**：exponential backoff（60s → 120s → 240s，max 3 次），**靜默 retry**，**不跳 snackbar 騷擾**；3 次皆失敗才顯示小 banner「連線不穩，點此重試」。保留既有 state 不清空

M6+ 再視情況加 `io("/prestige")` namespace 推播 `trial_pass` / `awakening` 廣播。**不納入 M6 scope**。

### 7. Rankings 擴欄（M6.9）⚠️ 改複合 build tag

現 `/api/chat-levels/rankings` 只回 `{rank, level, experience, displayName}`。改增欄位：

```js
{
  rank: 1,
  level: 87,
  experience: 81234,       // current_exp
  prestigeCount: 2,
  awakened: false,
  blessingIds: [1, 3],     // owned blessing ids
  buildTag: null,          // server 算好的 build 標籤（見下）
  displayName: "..."
}
```

**Build tag 計算**（backend, 沿用 M5 `evaluateBuildAchievementKeys` 邏輯）：
- `{2,3}` → `breeze`（🌬️ 疾風）
- `{4,5}` → `torrent`（🌊 洪流）
- `{6,7}` → `temperature`（🌡️ 溫度）
- `!6` 且已擁有 ≥ 3 祝福 → `solitude`（🏝️ 孤獨）
- 以上皆不符 → `null`（顯示為「自選」）

多個 tag 符合時取第一個非空（優先級 breeze > torrent > temperature > solitude）。

**前端 Rankings 頁**（`pages/Rankings/index.jsx` + `RankingBarChart.jsx`）：
- level tab 的每列附加：`Lv.87 ★★☆☆☆` + buildTag 單一 Chip（如 `🌬️ 疾風`）
- ✨ 覺醒標記：`prestigeCount >= 5` 顯示 gradient chip
- Chip 的 MUI `title` prop 提供 hover tooltip 列出 5 祝福全名；mobile 不支援 hover → 點擊該列 expand 下方 accordion 明細
- BarChart 的 bar label 保留原本 level 數字不動

**實作細節**：`ChatLevelController.api.queryRank` 現在查 legacy `ChatLevelModel.getRankList`，須改查 `chat_user_data` 新表（M1 的 schema），並 JOIN `user_blessings`。這同時也修掉 M5 沒處理的一個殘餘：rankings 目前還查 `ChatLevelModel` 舊欄位。

### 8. 路由 + Navigation

- 新增 route：`/prestige`（`App.jsx` Main routes 裡，和 `/achievements` 同級）
- `NavDrawer.jsx` 加一個項目：`{ icon: <AutoAwesomeIcon />, label: "轉生之路", to: "/prestige" }`（⚠️ 無 emoji prefix，保持與其他 nav 項目一致的 MUI icon 模式）
- LIFF deep link 由 backend 廣播（M7 範疇）生成 `line://app/{LIFF_ID}?path=/prestige`

### 9. Service 層抽象

新檔 `frontend/src/services/prestige.js`：

```js
import api from "./api";

export const getPrestigeStatus = () =>
  api.get("/api/prestige/status").then(res => res.data);

export const startTrial = trialId =>
  api.post("/api/prestige/trial/start", { trialId }).then(res => res.data);

export const forfeitTrial = () =>
  api.post("/api/prestige/trial/forfeit").then(res => res.data);

export const prestige = blessingId =>
  api.post("/api/prestige/prestige", { blessingId }).then(res => res.data);
```

**status 不帶 userId 參數**：一律用 token 的 `req.profile.userId`。玩家不能查別人的 prestige 狀態（與 Achievement 不同——Achievement 有 `userId` route param 公開）。

### 10. StatusCard badge 互斥顯示 ⚠️ 新決策

Badge slot 一次只顯示一個狀態，避免邏輯死區（蜜月與覺醒本就互斥）+ 視覺分散：

```
優先級：awakened > activeTrial > honeymoon > none
- awakened (prestige_count >= 5)   → `✨ 覺醒者` (gradient chip)
- activeTrial !== null             → `⚔️ ★N 試煉中` (star-color chip)
- honeymoon (prestige_count === 0) → `🌱 蜜月中` (success chip)
- 其他                              → 不顯示 badge
```

### 11. Reduced motion 支援 ⚠️ 新決策

Pro Max `reduced-motion` MEDIUM：所有動畫要尊重使用者 OS preference。

- Gradient glow / banner pulse / 倒數 tick pulse 在 `prefers-reduced-motion: reduce` 下降級為靜態
- 透過 MUI `useMediaQuery('(prefers-reduced-motion: reduce)')` 判斷
- Transition duration 上限 300ms（Pro Max `duration-timing`）

### 12. Countdown 分級呈現 ⚠️ 新決策

試煉剩餘時間依剩餘量切換格式，接近到期時視覺升級強度：

| 剩餘 | 格式 | 視覺 |
|---|---|---|
| `> 24h` | `剩餘 34 天 8 時` | 正常 text.primary |
| `1h–24h` | `剩餘 3 小時 42 分` | warning.main 色 |
| `< 1h` | `剩餘 23 分鐘` | error.main 色 + 輕微脈動（respect reduced-motion） |
| `expired` | `已失效 — 請放棄並重新挑戰` | error Alert |

Client-side `setInterval(60_000)` 即可，不需 per-second tick。

### 13. 5 次轉生 step tracker ⚠️ 新決策

StatusCard 下方加 MUI `<Stepper>`（非 Action Card 內），5 個步驟清楚可見「你在 5 步旅程的第 N 步」。解決 Pro Max `progress-indicators` MEDIUM 的「multi-step 缺步驟指示」缺口。

```
[1]✔ ─── [2]✔ ─── [3]● ─── [4]○ ─── [5]○
 啟程    刻苦    律動    孤鳴    覺悟
                 （進行中）
```

步驟對應 `passedTrials`（`[{id, star, displayName, passedAt}]`，順序按 star 排）+ `activeTrial?.star`。`passedTrialIds` 仍存在供其他呼叫端使用。

---

## 任務

### M6.1 — API endpoints

**File**: `app/src/router/api.js`

新增：

```js
const PrestigeController = require("../controller/application/PrestigeController");

router.get("/prestige/status", verifyToken, PrestigeController.api.status);
router.post("/prestige/trial/start", verifyToken, PrestigeController.api.startTrial);
router.post("/prestige/trial/forfeit", verifyToken, PrestigeController.api.forfeitTrial);
router.post("/prestige/prestige", verifyToken, PrestigeController.api.prestige);
```

**New file**: `app/src/controller/application/PrestigeController.js`

- `api.status`：call `PrestigeService.getPrestigeStatus(req.profile.userId)` → JSON
- `api.startTrial`：body `{trialId}`，validate number，call `startTrial`
- `api.forfeitTrial`：no body，call `forfeitTrial`
- `api.prestige`：body `{blessingId}`，validate number，call `prestige`
- Error handler：catch `err.code`，map 到 HTTP status（`AWAKENED`/`NOT_LEVEL_100`/`NO_*`/`ALREADY_*` → 400；`INVALID_*` → 404；其他 → 500），`res.json({code, message})`

`getPrestigeStatus` 回傳的 `availableTrials` / `availableBlessings` 要補 `description` 欄位（改 `app/src/service/PrestigeService.js:326-346`）。

**測試**：`__tests__/controller/PrestigeController.test.js`（6 tests）
- status: 200 轉出完整 payload
- startTrial: 200 happy path / 400 `ALREADY_ACTIVE`
- forfeitTrial: 200 happy path / 400 `NO_ACTIVE_TRIAL`
- prestige: 200 happy path / 400 `NOT_LEVEL_100`

### M6.2 — Frontend service layer

**New file**: `frontend/src/services/prestige.js`（見決策 9）

### M6.3 — Route + Nav

- `App.jsx`：在 `<Route path="achievements">` 下方加 `<Route path="prestige" element={<Prestige />} />`
- `components/NavDrawer.jsx`：導航項目 `{ icon: <AutoAwesomeIcon />, label: "轉生之路", to: "/prestige" }`

### M6.4 — Prestige dispatcher（主頁 = state machine）

**New file**: `frontend/src/pages/Prestige/index.jsx`

#### Layout（按畫面由上到下）

```
┌───────────────────────────────────────┐
│ 轉生之路                                │  ← Typography h5
│ 探索五道試煉，成為覺醒者                 │  ← subtitle
├───────────────────────────────────────┤
│                                       │
│  ┌─ StatusCard ──────────────────┐    │
│  │  Avatar   displayName         │    │
│  │           ★★★☆☆ 第 3 次轉生     │    │
│  │           Lv.87 / 100         │    │
│  │           [========--] 87%     │    │  ← LinearProgress to Lv.100
│  │           81,234 / ~95,200 XP │    │
│  │           [單一互斥 badge]     │    │  ← 見決策 10
│  └───────────────────────────────┘    │
│                                       │
│  ┌─ 5-step Stepper ──────────────┐    │  ← 決策 13
│  │  ① ✔ ─② ✔ ─③ ● ─④ ○ ─⑤ ○    │    │
│  │  啟程  刻苦  律動  孤鳴  覺悟   │    │
│  └───────────────────────────────┘    │
│                                       │
│  ┌─ ActionCard (state-aware) ────┐    │
│  │  [View switched by state]     │    │
│  └───────────────────────────────┘    │
│                                       │
│  ┌─ HistorySection ──────────────┐    │
│  │  已獲祝福（MUI icon + 名稱）    │    │
│  │  [🗣 語言] [⚡ 迅雷]             │    │  ← MUI icon chips
│  └───────────────────────────────┘    │
└───────────────────────────────────────┘
```

#### ActionCard 分支（subview components）

**A. <Lv.100 且無 activeTrial 無 passed（含首次）**：`LevelClimbView`
- 大字：「距離 Lv.100 還需 `N` XP」
- 灰底 disabled CTA 按鈕「開啟轉生之路」
- `prestige_count === 0 && currentLevel === 0`（首次）→ 額外 render 三步 onboarding：「① 爬到 Lv.100 → ② 選試煉 → ③ 選祝福完成轉生」+ FAQ accordion
- 可選：Collapsed「預覽試煉 ＆ 祝福」expander（玩家先看將來要挑什麼）

**B. <Lv.100 且 activeTrial ≠ null**：`LevelClimbView` + `TrialProgressCard`（compact）
- 上：同 A 的「距離 Lv.100」提示
- 下：compact 版 trial progress card（進度條 + 限制 + 剩餘天數 + forfeit 按鈕）

**C. Lv.100 且無 activeTrial 無 unconsumed**：`TrialSelectView`（見 M6.5）

**D. Lv.100 且 activeTrial ≠ null**：`TrialProgressView`（見 M6.7）

**E. Lv.100 且 hasUnconsumedPassedTrial**：`BlessingSelectView`（見 M6.6）
- 頂部提示「你已通過 ★N 試煉，選擇一個祝福完成第 `K` 次轉生」

**F. awakened**：`AwakenedView`（見 M6.8）

#### Polling

```js
useEffect(() => {
  let timer;
  let backoffAttempt = 0;
  const BASE_INTERVAL = 60_000;

  const tick = async () => {
    try {
      const s = await getPrestigeStatus();
      setStatus(s);
      setConnError(false);
      backoffAttempt = 0;
    } catch (err) {
      backoffAttempt += 1;
      if (backoffAttempt >= 3) setConnError(true);
      // keep prior status; UI still usable
    }
  };

  const scheduleNext = () => {
    const delay = BASE_INTERVAL * Math.pow(2, Math.min(backoffAttempt, 2));
    timer = setTimeout(async () => {
      await tick();
      if (status?.activeTrial) scheduleNext();
    }, delay);
  };

  tick();
  if (status?.activeTrial) scheduleNext();

  const onFocus = () => tick();
  const onVis = () => document.hidden ? clearTimeout(timer) : (tick(), scheduleNext());
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVis);
  };
}, [status?.activeTrial]);
```

Mutation 成功後 call `tick()` 立即更新。

#### Loading / Error / 未登入

- Loading：Skeleton rectangular 240px（對應 StatusCard 尺寸）
- 未登入：`<AlertLogin />`
- Error：Alert severity error + 重試按鈕
- Polling `connError === true`：頂部 dismissible banner「連線不穩，點此重試」

### M6.5 — TrialSelectView（5 選 1）

**File**: `frontend/src/pages/Prestige/TrialSelectView.jsx`

每張 card（點擊整張卡觸發 dialog，**不做 card 內重複按鈕**）：

```
┌───────────────────────┐
│  ★★★☆☆  中階・律動     │  ← 色+tier 文字雙編碼（決策 3）
│  律動                  │  ← displayName
│  冷卻曲線右移 ×1.33     │  ← restriction description
│  通過：2,500 XP / 60 天 │
│  🏆 永久：中段冷卻提升   │
│  （整張卡 clickable）    │  ← touch target 整 card ≥ 44×44
└───────────────────────┘
```

已通過：
```
┌───────────────────────┐
│  ✔ 已通過              │
│  ★1 啟程 · 初階         │
└───────────────────────┘   ← opacity 0.5, disabled, 不可點
```

**Grid**：`xs=12 sm=6 md=3`。mobile 1 張/行；tablet 2 張/行；desktop 第一列 3 張 + 第二列 2 張置左（`3+2` 比 `2+2+1` 視覺對稱）。相鄰卡 gap ≥ 8px（Pro Max `touch-spacing`）。

**互動**：點擊 disabled 以外的卡 → 叫出 AlertDialog：

> 挑戰 ★3 律動？
>
> 期間限制：冷卻曲線右移 ×1.33（8s 才滿速）
> 通過條件：60 天內累積 2,500 XP
> 通過獎勵：永久冷卻中段 tier 提升
>
> 若 60 天內未達成視為失敗，可再次挑戰。
>
> [取消] [確認挑戰 ★3 律動] ← 具體 action target

確認 → `startTrial(trialId)` → snackbar success → dispatcher 自動切 TrialProgressView。

### M6.6 — BlessingSelectView（7 選 1）

**File**: `frontend/src/pages/Prestige/BlessingSelectView.jsx`

每張 card（**整張卡 clickable，card 內無獨立按鈕**）：

```
┌───────────────────────┐
│   <MUI icon 32px>      │  ← MUI icon（非 emoji，決策 3/4）
│  語言天賦              │
│  單句基礎 XP +8%       │
└───────────────────────┘
```

**Blessing → MUI icon 映射**（新檔 `pages/Prestige/blessingIcons.js`）：

| id | slug | MUI icon |
|---|---|---|
| 1 | language_gift | `TranslateIcon` |
| 2 | swift_tongue | `BoltIcon` |
| 3 | ember_afterglow | `LocalFireDepartmentIcon` |
| 4 | whispering | `RecordVoiceOverIcon` |
| 5 | rhythm_spring | `GraphicEqIcon` |
| 6 | star_guard | `GroupsIcon` |
| 7 | greenhouse | `HomeWorkIcon` |

已取得：opacity 0.5 + 右上角 `CheckCircleIcon` + 「已擁有」label。

**Grid**：`xs=12 sm=6 md=4`（7 張卡在 md 排 3+3+1）。

**互動 — 前 4 次轉生**：點擊 → AlertDialog：

> 選擇祝福「語言天賦」？
>
> 效果：單句基礎 XP +8%（永久疊加）
>
> **此選擇不可重來**，祝福將永久鎖定在你的覺醒 build 中。
>
> 確認將完成第 `N` 次轉生，等級歸零從 Lv.1 重新開始。
>
> [取消] [選擇「語言天賦」並轉生]

**互動 — 第 5 次（最終）轉生**：點擊 → AlertDialog **含輸入確認**：

> 💫 最終祝福：語言天賦
>
> 完成後將進入 **覺醒終態**，**不再開放轉生**。
> 5 個祝福將永久鎖定，成為你的完整 build。
>
> 請輸入「語言天賦」以確認：
> [____________] ← TextField, primary button disabled 直到完全匹配
>
> [取消] [確認覺醒] (disabled until 輸入 "語言天賦")

確認 → `prestige(blessingId)` → 若返回 `awakened: true`，用 React Router `navigate("/prestige")` 刷新 dispatcher（自動 render `AwakenedView`）；否則亦 `navigate` 回主頁。

### M6.7 — TrialProgressView

**File**: `frontend/src/pages/Prestige/TrialProgressView.jsx`

```
┌──────────────────────────────────┐
│  進行中：★3 律動 · 中階・律動      │  ← 色+tier 文字雙編碼
│                                  │
│  [████████████-----] 62%         │  ← LinearProgress 彩色對應 star
│  1,550 / 2,500 XP                │
│                                  │
│  ⏰ 剩餘 34 天 8 時                │  ← countdown 按決策 12 分級
│                                  │
│  📋 期間限制                      │
│   冷卻曲線右移 ×1.33              │
│                                  │
│  🏆 通過獎勵                      │
│   永久冷卻中段 tier 提升           │
│                                  │
│  [ 放棄試煉 ]                     │  ← error-color outlined button
└──────────────────────────────────┘
```

- Countdown：見決策 12（分級顯示 + 逾期 alert）
- 進度條色：對應 star color（注意 ★5 已改紫）
- 放棄按鈕：AlertDialog error 色，label `[確認放棄 ★3]` → `forfeitTrial()` → snackbar + 重拉 status

### M6.8 — AwakenedView

**File**: `frontend/src/pages/Prestige/AwakenedView.jsx`

```
┌──────────────────────────────────┐
│   ✨ 覺醒者 ✨                     │  ← large headline, gradient
│                                   │  ← gradient respect reduced-motion
│   你已完成所有 5 道試煉             │
│   並擇取了你的祝福 build            │
│                                   │
│  ┌─ 通過試煉 ─────────────────┐   │
│  │  [★1 啟程·初階]              │   │
│  │  [★2 刻苦·中階負擔]           │   │
│  │  [★3 律動·中階律動]           │   │
│  │  [★4 孤鳴·高階]               │   │
│  │  [★5 覺悟·最終試煉]           │   │
│  └────────────────────────────┘   │
│                                   │
│  ┌─ 永久祝福 (5) ──────────────┐  │
│  │  <TranslateIcon> 語言天賦    │  │
│  │  <BoltIcon> 迅雷語速          │  │
│  │  <GraphicEqIcon> 節律之泉     │  │
│  │  <GroupsIcon> 群星加護        │  │
│  │  <HomeWorkIcon> 溫室之語      │  │
│  └────────────────────────────┘   │
│                                   │
│  ┌─ 解鎖成就（M5） ─────────────┐ │
│  │  你的 build 觸發的隱藏成就    │  │  ← 依 blessingIds 算
│  │  [🌬️ 疾風之道] [🏝️ 孤獨之道]  │  │
│  └────────────────────────────┘   │
│                                   │
│  （可繼續升等但等級上限保持 Lv.100）│
└──────────────────────────────────┘
```

純展示頁。

### M6.9 — Rankings 擴欄 ⚠️ 改複合 build tag

**Backend**：`app/src/controller/application/ChatLevelController.js#api.queryRank`
- 改查 `chat_user_data`（新 schema）+ LEFT JOIN `user_blessings`
- Server-side 計算 `buildTag`（見決策 7）
- 輸出 `{rank, level, experience, prestigeCount, awakened, blessingIds, buildTag, displayName}`

**Frontend**：`pages/Rankings/hooks.js`（新增欄位解析）、`pages/Rankings/RankingBarChart.jsx`（每列補徽章）

Prestige stars：`prestigeCount >= 5 ? "✨" : "★".repeat(prestigeCount) + "☆".repeat(5 - prestigeCount)`

Build tag Chip：
- 單一 Chip 顯示 `{emoji} {build name}`（例：`🌬️ 疾風`、`🌊 洪流`、`🏝️ 孤獨`）
- 無 buildTag 時 Chip 顯示 `自選`
- Desktop hover tooltip 列出完整 5 祝福名稱
- Mobile 點擊該 rank 列 → expand accordion 顯示 5 祝福明細

**實作細節**：`ChatLevelController.api.queryRank` 現在查 legacy `ChatLevelModel.getRankList`，須改查 `chat_user_data` 新表（M1 的 schema），並 JOIN `user_blessings`。這同時也修掉 M5 沒處理的一個殘餘：rankings 目前還查 `ChatLevelModel` 舊欄位。

### M6.10 — LIFF 整合 / 測試

- LIFF env 配置：無需新增 LIFF app，復用既有 `LINE_LIFF_ID`（全 LIFF 共用；個別頁 size 由 `/liff/:size/*` prefix 決定）
- Deep link：`line://app/{LINE_LIFF_ID}?path=/prestige`（M7 廣播文案用）
- 測試：
  - `PrestigeController.test.js`（6 tests，M6.1）
  - `frontend` 沒 test runner → 只做手動 smoke：每個 state 分支渲染 + mutation flow（在 PR 描述列出 steps）
  - A11y smoke：`prefers-reduced-motion` 切開驗證、tab 鍵順序、色盲模擬確認 tier 文字可辨

### M6.11 — Merge back

- `yarn test` 在 `app/` 全綠
- `yarn lint` 在 `app/` 與 `frontend/` 皆 clean
- `yarn build` 在 `frontend/` 成功
- `git checkout feat/chat-level-prestige && git merge --no-ff feat/clp-m6`

---

## Exit Criteria

- [ ] `/prestige` 單一入口 dispatcher 正確依 status 分派 6 種 view（含 awakened）
- [ ] StatusCard badge 單一互斥（決策 10）、5-step Stepper 正確反映進度（決策 13）
- [ ] 4 個 mutation endpoint 上線並通過 controller test
- [ ] 3 個不可逆動作皆有 AlertDialog 二次確認；按鈕 label 含具體 action target；第 5 次轉生要求輸入祝福名
- [ ] Rankings 頁顯示 prestigeCount、覺醒標記、buildTag 複合 Chip（非多 chip）
- [ ] 未登入顯示 `AlertLogin`；mutation 失敗顯示 HintSnackBar 中文錯誤
- [ ] Active trial 存在時 60s polling + focus trigger + exponential backoff
- [ ] 倒數時間分級呈現（>24h / 1h–24h / <1h / expired），respect reduced-motion
- [ ] 所有圖示用 MUI icon（非 emoji）；✨🌱 僅出現於 headline 文字裝飾
- [ ] ★1–★5 色 + tier 文字雙編碼，色盲可辨
- [ ] `yarn test` / `yarn lint` 全綠；`yarn build` 成功

## Non-goals（延後）

- **Socket.IO real-time**：trial_pass / awakening 即時推播給其他玩家 → M6+ 或 M11
- **Trial 歷史詳細 timeline**：失敗紀錄、重挑次數統計 → 之後 stats 頁
- **動畫**：轉生「成就解鎖」特效、覺醒銀幕閃光 → 先求可用，特效之後
- **i18n**：專案整體尚未 i18n
- **廣播文案 + 達標 CTA**：Lv.100 達標後群組推送「[用戶名] 已達成 Lv.100，可前往 LIFF 轉生」屬 M7 responsibility
