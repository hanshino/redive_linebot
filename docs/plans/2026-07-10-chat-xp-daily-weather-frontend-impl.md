# 每日奇異天氣 前端 & Flex Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓「每日奇異天氣」的天氣資訊出現在 LINE Flex 回應、LIFF 今日天氣卡（含購買）、與 XP 歷程的天氣標記上。

**Architecture:** 後端 `XpHistoryService` 多吐天氣欄位（逐筆 `weather_protected` + 每日 join `chat_daily_weather`/`user_weather_protections`）；新增 Weather Flex template 讓 `#今天天氣` 回卡片；前端在既有 XP 歷程頁加「今日天氣卡」元件與歷程天氣 chip / tooltip。純加顯示與購買 UI，不動 XP 計算。

**Tech Stack:** Node 22 / CommonJS 後端（Bottender + Express + Knex/MySQL + Jest），ESM 前端（React 19 + MUI 7 + Recharts + Vite，無 test runner）。

## Global Constraints

- 後端 CommonJS（`require`/`module.exports`）；前端 ESM。
- 後端測試：`cd app && yarn test -- <path>`。jest config `transform:{}` → **`jest.mock(...)` 不會 hoist**，必須放在被 mock 模組的 `require` 之前。
- 需要真 DB 的測試：本機先 `make infra`（MySQL:3306）。本分支基於 main（PR #755 已含天氣 migration），本機共用的 `Princess` DB 已有 `chat_daily_weather` / `user_weather_protections` / `chat_exp_events` 天氣欄位。
- ESLint：雙引號、trailing comma `es5`、100 字元寬。Husky pre-commit 停用 → commit 前自行 `yarn lint`。
- Flex template：顏色一律用 `app/src/templates/common/theme.js` 的 token，**不得硬編 hex**；`liffUri` 由 controller 算好傳入 template（template 內不呼叫 `getLiffUri`）。前端元件沿用該頁既有寫法（`services/api`、`context/useLiff`），可用 hex（前端無 theme-token 限制）。
- **不新增 npm 依賴、不新增路由。**
- feature flag（`chat_level.dailyWeather.enabled` / `.purchaseEnabled`）維持 off；本機驗證時把兩個 flag 設 true 後，**bot 與 worker 兩個 process 都要重啟**（config 在載入時快取）。
- API `GET /api/me/chat-weather/today` 回的 `weather` 是 **DB 原始欄位**：`{ date, weather_key, category, name, flavor_text, effects:{...}, protection_type, protection_name, protection_cost }`；另有 `protection`（列或 null）、`god_stone_balance`（number）。

---

## File Structure

**後端**
- `app/src/service/XpHistoryService.js` — 改 `shapeEvent`、新增 `shapeDay`、改 `buildDaily`、export 兩個 shape 函式。
- `app/src/templates/application/Weather.js`（新）— `generateWeatherBubble(...)`。
- `app/src/controller/application/WeatherController.js` — `showToday` 改回 Flex。
- Tests：`app/src/service/__tests__/XpHistoryService.shape.test.js`（新，純函式）、`app/src/service/__tests__/XpHistoryService.buildDaily.test.js`（新，真 DB）、`app/src/templates/application/__tests__/Weather.test.js`（新）、`app/src/controller/application/__tests__/WeatherController.test.js`（新）。

**前端**（全部在 `frontend/src/pages/XpHistory/`）
- `weatherLabels.js`（新）— 效果文字 helper，供卡片 / chip / tooltip 共用。
- `TodayWeather.jsx`（新）— 今日天氣卡（自持 fetch + 購買）。
- `index.jsx` — 掛載 `<TodayWeather />`。
- `chipsFromEvent.js` + `EventChips.jsx` — 逐筆天氣 chip。
- `DailyTrend.jsx` — tooltip 天氣行。

---

## Task 1: 後端 `shapeEvent` 吐 `weather_protected`

**Files:**
- Modify: `app/src/service/XpHistoryService.js:29-47`（`shapeEvent`）、`:110`（`module.exports`）
- Test: `app/src/service/__tests__/XpHistoryService.shape.test.js`（create）

**Interfaces:**
- Produces: `shapeEvent(row)` 回傳物件新增 `weather_protected: boolean`；`shapeEvent` 加入 exports。逐筆天氣名稱/效果沿用既有 `modifiers.weather`（pipeline 已寫），本 task 不動 pipeline。

- [ ] **Step 1: 寫失敗測試**

```js
// app/src/service/__tests__/XpHistoryService.shape.test.js
const { shapeEvent } = require("../XpHistoryService");

describe("shapeEvent weather", () => {
  it("exposes weather_protected as a boolean", () => {
    const e = shapeEvent({
      id: 1,
      ts: "2026-07-10 10:00:00",
      group_id: "C1",
      raw_exp: 20,
      effective_exp: 18,
      modifiers: JSON.stringify({ weather: { name: "沉默霧氣", category: "debuff" } }),
      weather_protected: 1,
    });
    expect(e.weather_protected).toBe(true);
    expect(e.modifiers.weather.name).toBe("沉默霧氣");
  });

  it("defaults weather_protected to false for legacy rows", () => {
    const e = shapeEvent({ id: 2, ts: "x", raw_exp: 5, effective_exp: 5, modifiers: null });
    expect(e.weather_protected).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd app && yarn test -- src/service/__tests__/XpHistoryService.shape.test.js`
Expected: FAIL（`shapeEvent is not a function` 或 `weather_protected` 為 undefined）

- [ ] **Step 3: 實作**

`shapeEvent` 的 return 物件內，`modifiers: parseModifiers(row.modifiers),` 之後加一行：

```js
    weather_protected: Boolean(row.weather_protected),
```

檔案最後 `module.exports` 改為：

```js
module.exports = { buildSummary, buildEvents, buildDaily, shapeEvent };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd app && yarn test -- src/service/__tests__/XpHistoryService.shape.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/service/XpHistoryService.js app/src/service/__tests__/XpHistoryService.shape.test.js
git commit -m "feat(chat-weather): expose weather_protected on XP history events"
```

---

## Task 2: 後端 `buildDaily` join 天氣與當日防護

**Files:**
- Modify: `app/src/service/XpHistoryService.js`（新增 `shapeDay`；改 `buildDaily:92-108`；export `shapeDay`）
- Test: 追加至 `app/src/service/__tests__/XpHistoryService.shape.test.js`（`shapeDay` 純測試）；`app/src/service/__tests__/XpHistoryService.buildDaily.test.js`（create，真 DB）

**Interfaces:**
- Consumes: 既有 `parseModifiers`、`toUtc8Date`。`ChatExpDaily.model.knex` = `mysql("chat_exp_daily")`（每次存取回傳新 builder，可安全 `.leftJoin`）。
- Produces: `shapeDay(row)` → `{ date, raw_exp, effective_exp, msg_count, honeymoon_active, trial_id, weather: {key,name,category,effects}|null, weather_protected: boolean }`；`buildDaily` 回 `{ days: [...] }`（經 `shapeDay`）；`shapeDay` 加入 exports。

- [ ] **Step 1: 寫失敗的 `shapeDay` 純測試**（追加到 shape.test.js）

```js
const { shapeDay } = require("../XpHistoryService");

describe("shapeDay weather", () => {
  it("maps joined weather + protection columns", () => {
    const d = shapeDay({
      date: "2026-07-10",
      raw_exp: 100,
      effective_exp: 80,
      msg_count: 5,
      honeymoon_active: 0,
      trial_id: null,
      weather_key: "silent_fog",
      weather_name: "沉默霧氣",
      weather_category: "debuff",
      weather_effects: JSON.stringify({ raw_xp_mult: 0.9 }),
      protection_id: 42,
    });
    expect(d.weather).toEqual({
      key: "silent_fog",
      name: "沉默霧氣",
      category: "debuff",
      effects: { raw_xp_mult: 0.9 },
    });
    expect(d.weather_protected).toBe(true);
  });

  it("null weather for days without a weather row", () => {
    const d = shapeDay({ date: "2026-01-01", weather_key: null, protection_id: null });
    expect(d.weather).toBeNull();
    expect(d.weather_protected).toBe(false);
  });

  it("weather_protected false on a buff day even if a protection row exists", () => {
    const d = shapeDay({
      date: "x",
      weather_key: "mana_tailwind",
      weather_category: "buff",
      weather_effects: "{}",
      protection_id: 7,
    });
    expect(d.weather_protected).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd app && yarn test -- src/service/__tests__/XpHistoryService.shape.test.js`
Expected: FAIL（`shapeDay is not a function`）

- [ ] **Step 3: 實作 `shapeDay` + export**

在 `buildDaily` 之前新增：

```js
function shapeDay(row) {
  return {
    date: toUtc8Date(row.date),
    raw_exp: row.raw_exp,
    effective_exp: row.effective_exp,
    msg_count: row.msg_count,
    honeymoon_active: Boolean(row.honeymoon_active),
    trial_id: row.trial_id ?? null,
    weather: row.weather_key
      ? {
          key: row.weather_key,
          name: row.weather_name,
          category: row.weather_category,
          effects: parseModifiers(row.weather_effects),
        }
      : null,
    weather_protected: Boolean(row.protection_id) && row.weather_category === "debuff",
  };
}
```

`module.exports` 改為：

```js
module.exports = { buildSummary, buildEvents, buildDaily, shapeEvent, shapeDay };
```

- [ ] **Step 4: 跑 `shapeDay` 純測試確認通過**

Run: `cd app && yarn test -- src/service/__tests__/XpHistoryService.shape.test.js`
Expected: PASS

- [ ] **Step 5: 改寫 `buildDaily` 加 join**

把 `buildDaily` 整段換成：

```js
async function buildDaily(userId, { from, to }) {
  const rows = await ChatExpDaily.model.knex
    .leftJoin("chat_daily_weather", "chat_exp_daily.date", "chat_daily_weather.date")
    .leftJoin("user_weather_protections", function () {
      this.on("user_weather_protections.weather_date", "=", "chat_exp_daily.date").andOn(
        "user_weather_protections.user_id",
        "=",
        "chat_exp_daily.user_id"
      );
    })
    .where("chat_exp_daily.user_id", userId)
    .andWhere("chat_exp_daily.date", ">=", from)
    .andWhere("chat_exp_daily.date", "<=", to)
    .orderBy("chat_exp_daily.date", "asc")
    .select(
      "chat_exp_daily.date as date",
      "chat_exp_daily.raw_exp as raw_exp",
      "chat_exp_daily.effective_exp as effective_exp",
      "chat_exp_daily.msg_count as msg_count",
      "chat_exp_daily.honeymoon_active as honeymoon_active",
      "chat_exp_daily.trial_id as trial_id",
      "chat_daily_weather.weather_key as weather_key",
      "chat_daily_weather.name as weather_name",
      "chat_daily_weather.category as weather_category",
      "chat_daily_weather.effects as weather_effects",
      "user_weather_protections.id as protection_id"
    );
  return { days: rows.map(shapeDay) };
}
```

- [ ] **Step 6: 寫 `buildDaily` 真 DB 整合測試**

```js
// app/src/service/__tests__/XpHistoryService.buildDaily.test.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../../.env") });
jest.unmock("../../util/mysql");
const mysql = jest.requireActual("../../util/mysql");
const { buildDaily } = require("../XpHistoryService");

const USER = "U" + "9".repeat(32);
const DATE = "2001-02-03"; // 固定過去日期，避免與真實資料衝突

describe("buildDaily weather join (real DB)", () => {
  beforeEach(async () => {
    await mysql("chat_exp_daily").where({ user_id: USER }).delete();
    await mysql("user_weather_protections").where({ user_id: USER }).delete();
    await mysql("chat_daily_weather").where({ date: DATE }).delete();
  });
  afterAll(() => mysql.destroy());

  it("joins global weather and per-user protection onto each day", async () => {
    await mysql("chat_exp_daily").insert({
      user_id: USER,
      date: DATE,
      raw_exp: 100,
      effective_exp: 80,
      msg_count: 5,
      honeymoon_active: 0,
      trial_id: null,
    });
    await mysql("chat_daily_weather").insert({
      date: DATE,
      weather_key: "silent_fog",
      category: "debuff",
      name: "沉默霧氣",
      flavor_text: "x",
      effects: JSON.stringify({ raw_xp_mult: 0.9 }),
      protection_type: "defog",
      protection_name: "破霧鈴",
      protection_cost: 30,
      generated_at: new Date(),
    });

    let res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days).toHaveLength(1);
    expect(res.days[0].weather).toMatchObject({ key: "silent_fog", category: "debuff" });
    expect(res.days[0].weather_protected).toBe(false);

    await mysql("user_weather_protections").insert({
      user_id: USER,
      weather_date: DATE,
      weather_key: "silent_fog",
      protection_type: "defog",
      protection_name: "破霧鈴",
      stone_cost: 30,
      purchased_at: new Date(),
    });

    res = await buildDaily(USER, { from: DATE, to: DATE });
    expect(res.days[0].weather_protected).toBe(true);
  });
});
```

- [ ] **Step 7: 跑整合測試確認通過**（需 `make infra`）

Run: `cd app && yarn test -- src/service/__tests__/XpHistoryService.buildDaily.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/src/service/XpHistoryService.js app/src/service/__tests__/XpHistoryService.shape.test.js app/src/service/__tests__/XpHistoryService.buildDaily.test.js
git commit -m "feat(chat-weather): join daily weather + protection into XP history buildDaily"
```

---

## Task 3: 後端 Weather Flex template

**Files:**
- Create: `app/src/templates/application/Weather.js`
- Test: `app/src/templates/application/__tests__/Weather.test.js`

**Interfaces:**
- Consumes: `require("../common/theme")` 的 `SEMANTIC` / `SURFACE`；`require("../../service/chatXp/weatherEffects")` 的 `describeEffects(effects)` → `string[]`（如 `["原始經驗 -10%"]`）。
- Produces: `generateWeatherBubble({ date, weather, protection, godStoneBalance, liffUri })` → LINE Flex bubble 物件。`weather` 為 DB 原始欄位（見 Global Constraints）。

- [ ] **Step 1: 寫失敗測試**

```js
// app/src/templates/application/__tests__/Weather.test.js
const { generateWeatherBubble } = require("../Weather");

function collect(node, key, acc = []) {
  if (Array.isArray(node)) node.forEach(n => collect(n, key, acc));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === "string") acc.push(v);
      collect(v, key, acc);
    }
  return acc;
}

const LIFF = "https://liff.line.me/INJECTED/xp-history";
const debuff = {
  date: "2026-07-10",
  weather: {
    weather_key: "silent_fog",
    category: "debuff",
    name: "沉默霧氣",
    flavor_text: "霧氣吞掉句尾。",
    effects: { raw_xp_mult: 0.9 },
    protection_type: "defog",
    protection_name: "破霧鈴",
    protection_cost: 30,
  },
  protection: null,
  godStoneBalance: 860,
  liffUri: LIFF,
};

describe("generateWeatherBubble", () => {
  it("returns a bubble showing name, effect and a purchase CTA on an unprotected debuff", () => {
    const b = generateWeatherBubble(debuff);
    expect(b.type).toBe("bubble");
    const texts = collect(b, "text").join("");
    expect(texts).toContain("沉默霧氣");
    expect(texts).toContain("破霧鈴");
    expect(texts).toContain("前往購買防護");
    expect(collect(b, "uri")).toContain(LIFF);
  });

  it("shows 已防護 and drops the purchase CTA when protected", () => {
    const b = generateWeatherBubble({ ...debuff, protection: { protection_name: "破霧鈴" } });
    const texts = collect(b, "text").join("");
    expect(texts).toContain("已防護");
    expect(texts).not.toContain("前往購買防護");
  });

  it("shows no protection section on a buff day", () => {
    const b = generateWeatherBubble({
      ...debuff,
      weather: {
        weather_key: "mana_tailwind",
        category: "buff",
        name: "魔力順風",
        flavor_text: "順風。",
        effects: { effective_xp_mult: 1.1 },
      },
      protection: null,
    });
    const texts = collect(b, "text").join("");
    expect(texts).toContain("魔力順風");
    expect(texts).not.toContain("前往購買防護");
    expect(texts).not.toContain("破霧鈴");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd app && yarn test -- src/templates/application/__tests__/Weather.test.js`
Expected: FAIL（`generateWeatherBubble is not a function`）

- [ ] **Step 3: 實作 template**

```js
// app/src/templates/application/Weather.js
const { SEMANTIC, SURFACE } = require("../common/theme");
const { describeEffects } = require("../../service/chatXp/weatherEffects");

const ACCENT = { debuff: SEMANTIC.warning, buff: SEMANTIC.success };

function textNode(text, extra = {}) {
  return { type: "text", text, wrap: true, size: "sm", color: SURFACE.text, ...extra };
}

/**
 * @param {object} p
 * @param {string} p.date
 * @param {object} p.weather DB 原始欄位
 * @param {object|null} p.protection 使用者當日防護列或 null
 * @param {number} p.godStoneBalance
 * @param {string} p.liffUri 由 controller 傳入的 LIFF 連結
 */
function generateWeatherBubble({ date, weather, protection, godStoneBalance, liffUri }) {
  const accent = ACCENT[weather.category] || SEMANTIC.success;
  const isDebuff = weather.category === "debuff";
  const isProtected = isDebuff && Boolean(protection);
  const effectText = describeEffects(weather.effects).join("、") || "無";

  const body = [
    textNode(weather.name, { weight: "bold", size: "lg" }),
    textNode(weather.flavor_text, { size: "xs", color: SURFACE.textMuted, margin: "sm" }),
    { type: "separator", margin: "md", color: SURFACE.dividerMuted },
    textNode(`效果：${effectText}`, {
      margin: "md",
      color: isProtected ? SURFACE.textDisabled : SURFACE.text,
      decoration: isProtected ? "line-through" : "none",
    }),
  ];

  if (isDebuff) {
    if (isProtected) {
      body.push(
        textNode(`已防護 · ${protection.protection_name}（今日有效）`, {
          margin: "md",
          size: "xs",
          color: SEMANTIC.info.main,
          weight: "bold",
        })
      );
    } else {
      body.push(
        textNode(`防護：${weather.protection_name} · ${weather.protection_cost} 女神石`, {
          margin: "md",
          size: "xs",
          color: SURFACE.textMuted,
        }),
        textNode(`尚未防護（你有 ${godStoneBalance} 女神石）`, {
          size: "xs",
          color: accent.main,
          weight: "bold",
        })
      );
    }
  } else {
    body.push(
      textNode("今日為增益天氣，無需防護。", {
        margin: "md",
        size: "xs",
        color: SURFACE.textMuted,
      })
    );
  }

  const cta = isDebuff && !isProtected ? "前往購買防護" : "查看經驗歷程";
  const filled = isDebuff && !isProtected;

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: accent.main,
      paddingAll: "md",
      contents: [
        { type: "text", text: "今日天氣", color: accent.contrast, weight: "bold", size: "sm" },
        { type: "text", text: date, color: accent.contrast, size: "xs", align: "end", gravity: "center" },
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "lg", spacing: "sm", contents: body },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "button",
          style: filled ? "primary" : "link",
          color: filled ? accent.main : SEMANTIC.info.main,
          height: "sm",
          action: { type: "uri", label: cta, uri: liffUri },
        },
      ],
    },
  };
}

module.exports = { generateWeatherBubble };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd app && yarn test -- src/templates/application/__tests__/Weather.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/templates/application/Weather.js app/src/templates/application/__tests__/Weather.test.js
git commit -m "feat(chat-weather): add today-weather Flex bubble template"
```

---

## Task 4: 後端 `showToday` 改回 Flex

**Files:**
- Modify: `app/src/controller/application/WeatherController.js:1-11`
- Test: `app/src/controller/application/__tests__/WeatherController.test.js`（create）

**Interfaces:**
- Consumes: `WeatherService.getTodayStatus(userId)` → `{ date, weather, protection, godStoneBalance }`；`getLiffUri("full", "/xp-history")`；`generateWeatherBubble(...)`（Task 3）。
- Produces: `showToday(context)`：無 weather → `replyText("今日天氣觀測暫停")`；有 weather → `replyFlex("今日天氣", bubble)`。

- [ ] **Step 1: 寫失敗測試**（`jest.mock` 必須在 require 之前）

```js
// app/src/controller/application/__tests__/WeatherController.test.js
jest.mock("../../../service/ChatWeatherService");
const WeatherService = require("../../../service/ChatWeatherService");
const Controller = require("../WeatherController");

function ctx(userId = "U1") {
  return { event: { source: { userId } }, replyText: jest.fn(), replyFlex: jest.fn() };
}

describe("WeatherController.showToday", () => {
  it("replies observation-paused text when weather is null", async () => {
    WeatherService.getTodayStatus.mockResolvedValue({ date: "d", weather: null, protection: null, godStoneBalance: 0 });
    const c = ctx();
    await Controller.showToday(c);
    expect(c.replyText).toHaveBeenCalledWith("今日天氣觀測暫停");
    expect(c.replyFlex).not.toHaveBeenCalled();
  });

  it("replies a Flex bubble when weather is present", async () => {
    WeatherService.getTodayStatus.mockResolvedValue({
      date: "2026-07-10",
      weather: {
        weather_key: "silent_fog",
        category: "debuff",
        name: "沉默霧氣",
        flavor_text: "x",
        effects: { raw_xp_mult: 0.9 },
        protection_type: "defog",
        protection_name: "破霧鈴",
        protection_cost: 30,
      },
      protection: null,
      godStoneBalance: 100,
    });
    const c = ctx();
    await Controller.showToday(c);
    expect(c.replyFlex).toHaveBeenCalledTimes(1);
    const [altText, bubble] = c.replyFlex.mock.calls[0];
    expect(altText).toBe("今日天氣");
    expect(bubble.type).toBe("bubble");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd app && yarn test -- src/controller/application/__tests__/WeatherController.test.js`
Expected: FAIL（目前 `showToday` 呼叫 `replyText`，第二個測試失敗）

- [ ] **Step 3: 實作**

檔案頂部 require 區加：

```js
const { getLiffUri } = require("../../templates/common");
const { generateWeatherBubble } = require("../../templates/application/Weather");

const XP_HISTORY_LIFF_PATH = "/xp-history";
```

`showToday` 換成：

```js
exports.showToday = async context => {
  const { userId } = context.event.source;
  if (!userId) {
    return context.replyText("獲取失敗，無法辨識用戶");
  }
  const status = await WeatherService.getTodayStatus(userId);
  if (!status.weather) {
    return context.replyText("今日天氣觀測暫停");
  }
  const bubble = generateWeatherBubble({
    ...status,
    liffUri: getLiffUri("full", XP_HISTORY_LIFF_PATH),
  });
  return context.replyFlex("今日天氣", bubble);
};
```

（`describeToday` 已無人使用，但先保留在 service，不在本 task 刪除。）

- [ ] **Step 4: 跑測試確認通過**

Run: `cd app && yarn test -- src/controller/application/__tests__/WeatherController.test.js`
Expected: PASS

- [ ] **Step 5: 全套後端測試 + lint**

Run: `cd app && yarn test --silent 2>&1 | tail -5 && yarn lint`
Expected: 全綠、lint 無錯。

- [ ] **Step 6: Commit**

```bash
git add app/src/controller/application/WeatherController.js app/src/controller/application/__tests__/WeatherController.test.js
git commit -m "feat(chat-weather): #今天天氣 replies a Flex card"
```

---

## Task 5: 前端效果文字 helper

**Files:**
- Create: `frontend/src/pages/XpHistory/weatherLabels.js`

**Interfaces:**
- Produces: `weatherEffectLabels(effects, { full }) => string[]`（如 `["原始 -10%"]` 或 `full` 時 `["原始經驗 -10%"]`）；`effectPct(v) => string`（`0.9`→`"-10%"`，`1.1`→`"+10%"`）。供 Task 6/7/8 共用。

- [ ] **Step 1: 建立檔案**

```js
// frontend/src/pages/XpHistory/weatherLabels.js
const SHORT = {
  cooldown_required_mult: "冷卻",
  raw_xp_mult: "原始",
  effective_xp_mult: "最終",
  group_bonus_mult: "群組",
};
const FULL = {
  cooldown_required_mult: "冷卻時間需求",
  raw_xp_mult: "原始經驗",
  effective_xp_mult: "最終經驗",
  group_bonus_mult: "群組加成",
};

export function effectPct(v) {
  const p = Math.round((Number(v) - 1) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function weatherEffectLabels(effects, { full = false } = {}) {
  const map = full ? FULL : SHORT;
  return Object.entries(effects || {}).map(([k, v]) => `${map[k] || k} ${effectPct(v)}`);
}
```

- [ ] **Step 2: 手動 sanity check**

心算核對：`effectPct(0.9)` → `"-10%"`、`effectPct(1.1)` → `"+10%"`、`effectPct(0.95)` → `"-5%"`；`weatherEffectLabels({ raw_xp_mult: 0.9 })` → `["原始 -10%"]`。無 test runner，本 helper 由 Task 6–8 的畫面驗證覆蓋。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/XpHistory/weatherLabels.js
git commit -m "feat(chat-weather): weather effect label helper (frontend)"
```

---

## Task 6: 前端今日天氣卡

**Files:**
- Create: `frontend/src/pages/XpHistory/TodayWeather.jsx`
- Modify: `frontend/src/pages/XpHistory/index.jsx`

**Interfaces:**
- Consumes: `services/api`（帶 token 的 axios）、`context/useLiff`、`weatherLabels`（Task 5）。API `GET /api/me/chat-weather/today`、`POST /api/me/chat-weather/protection/purchase`。
- Produces: `<TodayWeather />` 預設匯出，掛在 XP 歷程頁頂。`weather===null`（flag off / 觀測暫停）→ 不渲染。

- [ ] **Step 1: 建立元件**

```jsx
// frontend/src/pages/XpHistory/TodayWeather.jsx
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import api from "../../services/api";
import useLiff from "../../context/useLiff";
import { weatherEffectLabels } from "./weatherLabels";

const CATEGORY = {
  debuff: { color: "warning", label: "減益" },
  buff: { color: "success", label: "增益" },
};
const ERROR_MSG = {
  INSUFFICIENT_STONE: "女神石不足，無法購買。",
  ALREADY_PROTECTED: "你今天已經購買防護了。",
  NO_PROTECTION: "今日天氣沒有可購買的防護。",
  DISABLED: "目前無法購買防護。",
};

export default function TodayWeather() {
  const { loggedIn } = useLiff();
  const [data, setData] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get("/api/me/chat-weather/today")
      .then(res => setData(res.data))
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn, load]);

  if (!data || !data.weather) return null;

  const { weather, protection, god_stone_balance } = data;
  const cat = CATEGORY[weather.category] || CATEGORY.buff;
  const isDebuff = weather.category === "debuff";
  const protectedActive = isDebuff && Boolean(protection);
  const effectLabels = weatherEffectLabels(weather.effects, { full: true });

  const purchase = () => {
    setBusy(true);
    setError("");
    api
      .post("/api/me/chat-weather/protection/purchase")
      .then(() => {
        setConfirmOpen(false);
        load();
      })
      .catch(err => setError(ERROR_MSG[err?.response?.data?.code] || "購買失敗，請稍後再試。"))
      .finally(() => setBusy(false));
  };

  return (
    <Card variant="outlined" sx={{ borderTop: 4, borderTopColor: `${cat.color}.main` }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              今日天氣
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {weather.name}
            </Typography>
          </Box>
          <Chip size="small" color={cat.color} label={protectedActive ? "已防護" : cat.label} />
        </Stack>

        {weather.flavor_text && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {weather.flavor_text}
          </Typography>
        )}

        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.5 }}>
          {effectLabels.map(l => (
            <Chip
              key={l}
              size="small"
              variant="outlined"
              label={l}
              sx={protectedActive ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
            />
          ))}
          {protectedActive && (
            <Chip size="small" color="info" label={`已抵銷 · ${protection.protection_name}`} />
          )}
        </Stack>

        {isDebuff && !protectedActive && (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {weather.protection_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  防護今日減益 · {weather.protection_cost} 女神石
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setError("");
                  setConfirmOpen(true);
                }}
              >
                購買防護
              </Button>
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", textAlign: "right", mt: 1 }}
            >
              女神石餘額 {god_stone_balance}
            </Typography>
          </Box>
        )}

        {error && !confirmOpen && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)}>
        <DialogTitle>購買防護？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            花費 {weather.protection_cost} 女神石購買「{weather.protection_name}」，抵銷今日
            {weather.name}的減益（僅對購買後的發言生效）。
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="contained" onClick={purchase} disabled={busy}>
            確定購買
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 2: 掛載到頁面**

`frontend/src/pages/XpHistory/index.jsx`：
- import 區加 `import TodayWeather from "./TodayWeather";`
- 在 `{!loggedIn && <AlertLogin />}` 這行之後、`<Tabs ...>` 之前插入：

```jsx
      {loggedIn && (
        <Box sx={{ mb: 2 }}>
          <TodayWeather />
        </Box>
      )}
```

（`Box` 已在 index.jsx import。）

- [ ] **Step 3: Lint**

Run: `cd frontend && yarn lint`
Expected: 無錯。

- [ ] **Step 4: 手動驗證**

1. root `.env` 或 `app/config/default.json` 把 `chat_level.dailyWeather.enabled` 與 `.purchaseEnabled` 設 `true`。
2. 重啟 **bot 與 worker**（config 載入時快取）。
3. `cd frontend && yarn dev`，於 LIFF/瀏覽器開 `/xp-history`。
4. 檢查：減益日顯示效果 chip + 購買鈕 + 餘額；點購買 → 確認框 → 確定 → 卡片刷新為「已防護」；增益日無購買鈕；`enabled=false` 時整卡不出現。
5. 錯誤情境：女神石不足 → 顯示「女神石不足」。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/XpHistory/TodayWeather.jsx frontend/src/pages/XpHistory/index.jsx
git commit -m "feat(chat-weather): today-weather card with purchase flow on XP history page"
```

---

## Task 7: 前端逐筆事件天氣 chip

**Files:**
- Modify: `frontend/src/pages/XpHistory/chipsFromEvent.js`
- Modify: `frontend/src/pages/XpHistory/EventChips.jsx`

**Interfaces:**
- Consumes: `event.modifiers.weather`（`{name, category, effects, protection_name}`，pipeline 已寫）、`event.weather_protected`（Task 1）、`weatherEffectLabels`（Task 5）。
- Produces: `chipsFromEvent(ev)` 於既有陣列尾端追加天氣相關 chip；`EventChips.STYLES` 新增 `weatherDebuff` / `weatherBuff` / `weatherProtect`。

- [ ] **Step 1: 擴充 `chipsFromEvent`**

檔案頂部 import 區加：

```js
import { weatherEffectLabels } from "./weatherLabels";
```

在 `return chips;` 之前插入：

```js
  const w = m.weather;
  if (w) {
    const wkind = w.category === "buff" ? "weatherBuff" : "weatherDebuff";
    chips.push({ kind: wkind, label: `天氣：${w.name}` });
    if (ev.weather_protected) {
      chips.push({ kind: "weatherProtect", label: `已防護：${w.protection_name || "已抵銷"}` });
    } else {
      weatherEffectLabels(w.effects).forEach(l => chips.push({ kind: wkind, label: l }));
    }
  }
```

- [ ] **Step 2: 新增 chip 樣式**

`EventChips.jsx` 的 `STYLES` 物件加三個 key：

```js
  weatherDebuff: { bg: "#FBEEE1", fg: "#B96322" },
  weatherBuff: { bg: "#E4F2EA", fg: "#2B8C63" },
  weatherProtect: { bg: "#E6EDFB", fg: "#3767CF" },
```

- [ ] **Step 3: Lint**

Run: `cd frontend && yarn lint`
Expected: 無錯。

- [ ] **Step 4: 手動驗證**

於 `/xp-history`「逐筆」分頁：減益日事件顯示「天氣：<名>」+ 效果 chip；已防護事件顯示「天氣：<名>」+「已防護：<道具>」（無效果 chip）；增益日顯示綠色天氣 chip；舊事件（無 `modifiers.weather`）無天氣 chip。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/XpHistory/chipsFromEvent.js frontend/src/pages/XpHistory/EventChips.jsx
git commit -m "feat(chat-weather): per-event weather chips in XP history"
```

---

## Task 8: 前端每日趨勢 tooltip 天氣行

**Files:**
- Modify: `frontend/src/pages/XpHistory/DailyTrend.jsx`

**Interfaces:**
- Consumes: `day.weather`（`{name, category, effects}|null`）、`day.weather_protected`（Task 2）、`weatherEffectLabels`（Task 5）。
- Produces: `TrendTooltip` 多一行天氣（hover/點按顯示）。

> 說明：`DailyTrend` 是 Recharts 圖，天氣放進既有 tooltip（已有蜜月/試煉小行的 pattern），不做每根長條下方常駐徽章。

- [ ] **Step 1: import helper**

`DailyTrend.jsx` 頂部加：

```js
import { weatherEffectLabels } from "./weatherLabels";
```

- [ ] **Step 2: chartData 帶上天氣**

`useMemo` 內 `chartData: rows.map(d => ({ ... }))` 物件加兩個欄位（在 `trial_id: d.trial_id,` 之後）：

```js
        weather: d.weather,
        weather_protected: d.weather_protected,
```

- [ ] **Step 3: tooltip 加天氣行**

`TrendTooltip` 內 `{d.trial_id && ...}` 那行之後插入：

```jsx
      {d.weather && (
        <Box
          sx={{
            color: d.weather.category === "buff" ? COLORS.greenDeep : "#B96322",
            fontSize: 10,
          }}
        >
          {d.weather.category === "buff" ? "☀" : "🌫"} {d.weather.name}
          {d.weather_protected
            ? " · 已防護"
            : ` · ${weatherEffectLabels(d.weather.effects).join(" ")}`}
        </Box>
      )}
```

- [ ] **Step 4: Lint**

Run: `cd frontend && yarn lint`
Expected: 無錯。

- [ ] **Step 5: 手動驗證**

於 `/xp-history`「每日趨勢」分頁，hover/點按長條：有天氣的日子在 tooltip 顯示天氣名 + 效果（或「已防護」）；無天氣的舊日子不顯示該行。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/XpHistory/DailyTrend.jsx
git commit -m "feat(chat-weather): weather line in XP daily-trend tooltip"
```

---

## Self-Review

**Spec coverage（對照 `...frontend-design.md`）：**
- §A.1 `shapeEvent` weather_protected → Task 1 ✓
- §A.2 `buildDaily` join 天氣 + 當日防護 → Task 2 ✓
- §B Flex（`#今天天氣`）→ Task 3（template）+ Task 4（controller）✓
- §C LIFF 今日天氣卡（含購買動線、錯誤碼、flag off 不渲染）→ Task 6 ✓
- §D 歷程標記：逐筆 chip → Task 7 ✓；每日趨勢 → Task 8（tooltip，非常駐徽章，見該 task 說明）✓
- §5 測試：後端單元/整合 → Task 1/2/3/4；前端手動 → Task 6/7/8 ✓
- 共用效果文字 → Task 5 ✓

**Placeholder scan：** 無 TODO/TBD；每個改動皆附實際程式碼與確切檔案/行號區塊。

**Type consistency：** `weatherEffectLabels(effects, {full})` 在 Task 5 定義，Task 6（full）/7/8（short）一致使用；`shapeDay` 產出的 `day.weather`/`day.weather_protected` 與 Task 8 tooltip 讀取一致；`generateWeatherBubble` 參數（Task 3）與 controller 傳入（Task 4）一致；API `weather` DB 原始欄位形狀在 Global Constraints 定義，Task 3/6 一致使用。

**已知偏離 mockup（需留意）：** 每日趨勢天氣走 tooltip 而非常駐徽章（Recharts 圖，見 Task 8）。
