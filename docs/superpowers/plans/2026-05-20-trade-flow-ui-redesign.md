# #交易 LIFF Redesign + TradeNotify Flex Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `#交易` LIFF flow (Order / Detail / Transaction) and the TradeNotify Flex bubble in line with the existing card-style design language, collapse Detail+Transaction into one viewer-aware page, replace blind buyer dialog confirmation with a checkout-style preview, and route both accept/deny through LIFF.

**Architecture:** Backend gains a `/api/profile/:userId` resolver with 3-layer cache (Redis → MySQL `user` table → LINE API) and enriches `/api/market/:id` with seller/buyer display names + star. Frontend rewrites `Order.jsx`, replaces `Detail.jsx` + `Transaction.jsx` with a single role-branching `TradeDetail.jsx`, and rewrites the TradeNotify Flex bubble to a single-CTA card that funnels users back into the LIFF page for the actual decision. No schema, no router-level business logic change.

**Tech Stack:** Node.js (CommonJS), Knex (MySQL), Jest, Express, React 19 + MUI 7 + Vite, LINE LIFF SDK, LINE Flex Messages.

**Spec:** [`docs/superpowers/specs/2026-05-20-trade-flow-ui-redesign-design.md`](../specs/2026-05-20-trade-flow-ui-redesign-design.md)

**Branch:** `feat/trade-flow-redesign` (already created, spec committed at `2d10bcc`).

---

## Design Principles

- **Backend before frontend.** Profile resolver + enrichment land first so frontend has the data it needs.
- **TDD on backend logic; manual QA on frontend.** Frontend has no test runner (CLAUDE.md), so frontend tasks rely on lint + `make cf-go` manual verification.
- **Every milestone leaves `yarn test:app` and both lints green.** Run `yarn lint:app` + `yarn lint:frontend` at the end of each milestone.
- **Frequent commits.** One commit per task (test + impl + lint together), conventional-commit prefix (`feat` / `refactor` / `docs`).
- **Routes are kept additively, never broken.** New `/trade/:marketId` is added; old `/trade/:marketId/detail` becomes an alias, and `/trade/:marketId/transaction` redirects — preserves any in-flight TradeNotify bubbles.

---

## File Map

### Created

- `app/src/handler/Profile/index.js`
- `app/__tests__/api/Profile.test.js`
- `app/__tests__/model/UserModel.test.js`
- `app/__tests__/api/Market.show.test.js`
- `frontend/src/pages/Trade/TradeDetail.jsx`
- `frontend/src/pages/Trade/_shared.js`
- `frontend/src/pages/Trade/CharacterPickerDrawer.jsx`

### Modified

- `app/src/model/application/UserModel.js` — add `getProfile(platformId)`
- `app/src/model/application/MarketDetail.js` — extend `getById` SELECT with `GachaPool.star`
- `app/src/handler/Market/index.js` — `show()` enriches response with `seller_display_name` / `buyer_display_name` / `star`
- `app/src/router/api.js` — register `GET /api/profile/:userId`
- `frontend/src/pages/Trade/Order.jsx` — rewrite
- `frontend/src/flex/TradeNotify.js` — rewrite (new signature)
- `frontend/src/App.jsx` — replace 3 trade routes with 1 + redirect shim

### Deleted

- `frontend/src/pages/Trade/Detail.jsx`
- `frontend/src/pages/Trade/Transaction.jsx`

---

## Task Index

| # | Title | Files |
|---|---|---|
| **Milestone A — Backend resolver** | | |
| A1 | `UserModel.getProfile` | `UserModel.js`, `__tests__/model/UserModel.test.js` |
| A2 | Profile handler (3-layer cache) | `handler/Profile/index.js`, `__tests__/api/Profile.test.js` |
| A3 | Wire `/api/profile/:userId` route | `router/api.js` |
| **Milestone B — Backend enrichment** | | |
| B1 | `MarketDetail.getById` includes star | `model/application/MarketDetail.js` |
| B2 | `MarketController.show` enriches response | `handler/Market/index.js`, `__tests__/api/Market.show.test.js` |
| **Milestone C — Frontend shared** | | |
| C1 | Trade shared module (`_shared.js`) | `pages/Trade/_shared.js` |
| C2 | Character picker drawer component | `pages/Trade/CharacterPickerDrawer.jsx` |
| **Milestone D — Order page** | | |
| D1 | Rewrite Order.jsx (banner + picker + price + sticky bar) | `pages/Trade/Order.jsx` |
| D2 | Order → Detail navigation on submit | `pages/Trade/Order.jsx` |
| **Milestone E — Unified TradeDetail** | | |
| E1 | TradeDetail scaffold + role resolution + Skeleton | `pages/Trade/TradeDetail.jsx` |
| E2 | Banner + hero card + details card | `pages/Trade/TradeDetail.jsx` |
| E3 | Buyer balance fetch + balance card | `pages/Trade/TradeDetail.jsx` |
| E4 | Action footer (seller / buyer × status) | `pages/Trade/TradeDetail.jsx` |
| E5 | Delete old Detail.jsx + Transaction.jsx | (deletions) |
| **Milestone F — Routes** | | |
| F1 | Update App.jsx routes + redirect shim | `App.jsx` |
| **Milestone G — TradeNotify Flex** | | |
| G1 | Rewrite genNotify (new signature) | `flex/TradeNotify.js` |
| G2 | Update callers (Order success + TradeDetail re-notify) | `pages/Trade/Order.jsx`, `pages/Trade/TradeDetail.jsx` |
| **Milestone H — Verify & finalise** | | |
| H1 | Full lint + test pass | (no code) |
| H2 | Manual QA against tunnel | (no code) |

---

## Milestone A — Backend resolver

### Task A1: Add `UserModel.getProfile(platformId)`

**Files:**
- Modify: `app/src/model/application/UserModel.js`
- Create: `app/__tests__/model/UserModel.test.js`

- [ ] **Step 1: Write failing test**

Create `app/__tests__/model/UserModel.test.js`:

```js
const mysql = require("../../src/util/mysql");
const UserModel = require("../../src/model/application/UserModel");

jest.mock("../../src/util/mysql");

describe("UserModel.getProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns { displayName, pictureUrl } when row exists", async () => {
    mysql.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { display_name: "Alice", picture_url: "https://x/a.png" },
      ]),
    });

    const result = await UserModel.getProfile("Uabc");
    expect(result).toEqual({ displayName: "Alice", pictureUrl: "https://x/a.png" });
  });

  it("returns null when no row found", async () => {
    mysql.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    });

    const result = await UserModel.getProfile("Uunknown");
    expect(result).toBeNull();
  });

  it("returns null when display_name is null in DB", async () => {
    mysql.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([{ display_name: null, picture_url: null }]),
    });

    const result = await UserModel.getProfile("Ublank");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Verify it fails**

```
cd app && yarn test -- __tests__/model/UserModel.test.js
```

Expected: FAIL — `UserModel.getProfile is not a function`.

- [ ] **Step 3: Implement**

Append to `app/src/model/application/UserModel.js`:

```js
/**
 * 取得用戶顯示資訊
 * @param {String} platformId 平台ID
 * @returns {Promise<{displayName: string, pictureUrl: string}|null>}
 */
exports.getProfile = async platformId => {
  const rows = await mysql
    .select({ display_name: "display_name", picture_url: "picture_url" })
    .from(USER_TABLE)
    .where({ platform_id: platformId });

  if (rows.length === 0) return null;
  const { display_name, picture_url } = rows[0];
  if (!display_name) return null;
  return { displayName: display_name, pictureUrl: picture_url || null };
};
```

- [ ] **Step 4: Verify it passes**

```
cd app && yarn test -- __tests__/model/UserModel.test.js
```

Expected: PASS, 3/3.

- [ ] **Step 5: Lint + commit**

```
cd app && yarn lint
cd .. && git add app/src/model/application/UserModel.js app/__tests__/model/UserModel.test.js
git commit -m "feat(trade): add UserModel.getProfile for trade profile lookups"
```

---

### Task A2: Profile handler with 3-layer cache

**Files:**
- Create: `app/src/handler/Profile/index.js`
- Create: `app/__tests__/api/Profile.test.js`

- [ ] **Step 1: Write failing tests**

Create `app/__tests__/api/Profile.test.js`:

```js
const { getProfile } = require("../../src/handler/Profile");
const redis = require("../../src/util/redis");
const UserModel = require("../../src/model/application/UserModel");
const { getClient } = require("bottender");

jest.mock("../../src/util/redis");
jest.mock("../../src/model/application/UserModel");
jest.mock("bottender", () => ({ getClient: jest.fn() }));

function makeRes() {
  return {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
}

describe("Profile handler GET /:userId", () => {
  let lineClient;

  beforeEach(() => {
    jest.clearAllMocks();
    lineClient = { getUserProfile: jest.fn() };
    getClient.mockReturnValue(lineClient);
  });

  it("serves from redis cache when available", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ displayName: "Alice", pictureUrl: "x" }));
    const req = { params: { userId: "Ualice" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(redis.get).toHaveBeenCalledWith("profile:Ualice");
    expect(res.json).toHaveBeenCalledWith({
      userId: "Ualice",
      displayName: "Alice",
      pictureUrl: "x",
    });
    expect(UserModel.getProfile).not.toHaveBeenCalled();
    expect(lineClient.getUserProfile).not.toHaveBeenCalled();
  });

  it("falls through to UserModel when redis misses", async () => {
    redis.get.mockResolvedValue(null);
    UserModel.getProfile.mockResolvedValue({ displayName: "Bob", pictureUrl: "y" });
    const req = { params: { userId: "Ubob" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(UserModel.getProfile).toHaveBeenCalledWith("Ubob");
    expect(redis.set).toHaveBeenCalledWith(
      "profile:Ubob",
      JSON.stringify({ displayName: "Bob", pictureUrl: "y" }),
      { EX: 1800 }
    );
    expect(res.json).toHaveBeenCalledWith({
      userId: "Ubob",
      displayName: "Bob",
      pictureUrl: "y",
    });
  });

  it("falls through to LINE API when both caches miss", async () => {
    redis.get.mockResolvedValue(null);
    UserModel.getProfile.mockResolvedValue(null);
    lineClient.getUserProfile.mockResolvedValue({
      displayName: "Carol",
      pictureUrl: "z",
    });
    const req = { params: { userId: "Ucarol" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(lineClient.getUserProfile).toHaveBeenCalledWith("Ucarol");
    expect(redis.set).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      userId: "Ucarol",
      displayName: "Carol",
      pictureUrl: "z",
    });
  });

  it("returns fallback when LINE API also fails", async () => {
    redis.get.mockResolvedValue(null);
    UserModel.getProfile.mockResolvedValue(null);
    lineClient.getUserProfile.mockRejectedValue(new Error("LINE 404"));
    const req = { params: { userId: "Uxxxxabcd" } };
    const res = makeRes();

    await getProfile(req, res);

    expect(res.json).toHaveBeenCalledWith({
      userId: "Uxxxxabcd",
      displayName: "User-abcd",
      pictureUrl: null,
    });
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step 2: Verify it fails**

```
cd app && yarn test -- __tests__/api/Profile.test.js
```

Expected: FAIL — cannot find module `../../src/handler/Profile`.

- [ ] **Step 3: Implement**

Create `app/src/handler/Profile/index.js`:

```js
const { getClient } = require("bottender");
const redis = require("../../util/redis");
const UserModel = require("../../model/application/UserModel");
const { DefaultLogger } = require("../../util/Logger");

const REDIS_KEY = userId => `profile:${userId}`;
const REDIS_TTL_SEC = 30 * 60;
const LINE_PROFILE_TIMEOUT_MS = 200;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LINE profile timeout")), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function fallback(userId) {
  return {
    userId,
    displayName: `User-${userId.slice(-4)}`,
    pictureUrl: null,
  };
}

/**
 * GET /api/profile/:userId
 * Three-layer cache resolver: Redis -> MySQL -> LINE API -> fallback.
 */
exports.getProfile = async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: "missing userId" });
  }

  // Layer 1: Redis
  try {
    const cached = await redis.get(REDIS_KEY(userId));
    if (cached) {
      const parsed = JSON.parse(cached);
      return res.json({ userId, ...parsed });
    }
  } catch (e) {
    DefaultLogger.warn(`Profile redis miss for ${userId}: ${e.message}`);
  }

  // Layer 2: MySQL user table
  try {
    const dbProfile = await UserModel.getProfile(userId);
    if (dbProfile) {
      await redis
        .set(REDIS_KEY(userId), JSON.stringify(dbProfile), { EX: REDIS_TTL_SEC })
        .catch(() => {});
      return res.json({ userId, ...dbProfile });
    }
  } catch (e) {
    DefaultLogger.warn(`Profile DB miss for ${userId}: ${e.message}`);
  }

  // Layer 3: LINE API (with timeout)
  try {
    const lineClient = getClient("line");
    const profile = await withTimeout(
      lineClient.getUserProfile(userId),
      LINE_PROFILE_TIMEOUT_MS
    );
    const result = {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl || null,
    };
    await redis
      .set(REDIS_KEY(userId), JSON.stringify(result), { EX: REDIS_TTL_SEC })
      .catch(() => {});
    UserModel.updateProfile(userId, profile).catch(() => {});
    return res.json({ userId, ...result });
  } catch (e) {
    DefaultLogger.warn(`Profile LINE API miss for ${userId}: ${e.message}`);
  }

  // Fallback
  return res.json(fallback(userId));
};
```

- [ ] **Step 4: Verify it passes**

```
cd app && yarn test -- __tests__/api/Profile.test.js
```

Expected: PASS, 4/4.

- [ ] **Step 5: Lint + commit**

```
cd app && yarn lint
cd .. && git add app/src/handler/Profile/index.js app/__tests__/api/Profile.test.js
git commit -m "feat(profile): add /api/profile resolver with 3-layer cache"
```

---

### Task A3: Wire route in `api.js`

**Files:**
- Modify: `app/src/router/api.js`

- [ ] **Step 1: Add import + route**

Find the block of `require` lines near the top of `app/src/router/api.js` (around line 1–35). After the existing `const { router: MarketRouter } = require("./Market");` line, add:

```js
const { getProfile } = require("../handler/Profile");
```

Find a section near other `verifyToken` routes (search for `router.get("/me", verifyToken, async`). Above or below that block, add:

```js
router.get("/profile/:userId", verifyToken, getProfile);
```

- [ ] **Step 2: Smoke check the registration**

Run the existing test suite to make sure no module-load regression:

```
cd app && yarn test -- __tests__/api 2>&1 | tail -20
```

Expected: existing tests pass; no failures from the new import.

- [ ] **Step 3: Lint + commit**

```
cd app && yarn lint
cd .. && git add app/src/router/api.js
git commit -m "feat(profile): wire GET /api/profile/:userId route"
```

---

## Milestone B — Backend enrichment

### Task B1: `MarketDetail.getById` includes `GachaPool.star`

**Files:**
- Modify: `app/src/model/application/MarketDetail.js:4-20`

- [ ] **Step 1: Update SELECT**

Replace the `getById` body in `app/src/model/application/MarketDetail.js`:

```js
getById(id) {
  return this.knex
    .select([
      { id: `${this.table}.id` },
      "item_id",
      "seller_id",
      "price",
      "quantity",
      "sell_target_list",
      "status",
      "created_at",
      "sold_at",
      "closed_at",
      { name: "Name" },
      { image: "HeadImage_Url" },
      { star: "GachaPool.star" },
    ])
    .leftJoin("GachaPool", "GachaPool.ID", "item_id")
    .where({ [`${this.table}.id`]: id })
    .first();
}
```

(Also adds `created_at`, `sold_at`, `closed_at` — `TradeDetail.jsx` will render these and they're cheap to include.)

- [ ] **Step 2: Verify nothing broke**

```
cd app && yarn test
```

Expected: PASS (no existing test touches MarketDetail.getById return shape; new fields are additive).

- [ ] **Step 3: Lint + commit**

```
cd app && yarn lint
cd .. && git add app/src/model/application/MarketDetail.js
git commit -m "feat(trade): include star + timestamps in MarketDetail.getById"
```

---

### Task B2: `MarketController.show` enriches response

**Files:**
- Modify: `app/src/handler/Market/index.js:15-34`
- Create: `app/__tests__/api/Market.show.test.js`

- [ ] **Step 1: Write failing test**

Create `app/__tests__/api/Market.show.test.js`:

```js
const MarketController = require("../../src/handler/Market");
const MarketDetailModel = require("../../src/model/application/MarketDetail");
const UserModel = require("../../src/model/application/UserModel");
const redis = require("../../src/util/redis");

jest.mock("../../src/model/application/MarketDetail");
jest.mock("../../src/model/application/UserModel");
jest.mock("../../src/util/redis");
jest.mock("bottender", () => ({ getClient: jest.fn(() => ({ getUserProfile: jest.fn() })) }));

function makeRes() {
  return {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
}

describe("MarketController.show enrichment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  it("attaches seller_display_name / buyer_display_name / star", async () => {
    MarketDetailModel.getById.mockResolvedValue({
      id: 1,
      seller_id: "Useller",
      sell_target_list: ["Ubuyer"],
      price: 1000,
      item_id: 999,
      status: 0,
      name: "Pecorine",
      image: "img.png",
      star: 3,
    });
    UserModel.getProfile.mockImplementation(async userId => {
      if (userId === "Useller") return { displayName: "Alice", pictureUrl: null };
      if (userId === "Ubuyer") return { displayName: "Bob", pictureUrl: null };
      return null;
    });

    const req = { params: { id: "1" }, profile: { userId: "Ubuyer" } };
    const res = makeRes();

    await MarketController.show(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.seller_display_name).toBe("Alice");
    expect(payload.buyer_display_name).toBe("Bob");
    expect(payload.star).toBe(3);
  });

  it("falls back to User-XXXX when profile lookup returns null", async () => {
    MarketDetailModel.getById.mockResolvedValue({
      id: 2,
      seller_id: "Ulongseller12345",
      sell_target_list: ["Ulongbuyer67890"],
      price: 100,
      item_id: 999,
      status: 0,
      name: "x",
      image: "x",
      star: 1,
    });
    UserModel.getProfile.mockResolvedValue(null);

    const req = { params: { id: "2" }, profile: { userId: "Ulongbuyer67890" } };
    const res = makeRes();

    await MarketController.show(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.seller_display_name).toBe("User-2345");
    expect(payload.buyer_display_name).toBe("User-7890");
  });
});
```

- [ ] **Step 2: Verify it fails**

```
cd app && yarn test -- __tests__/api/Market.show.test.js
```

Expected: FAIL — no `seller_display_name` in payload.

- [ ] **Step 3: Implement enrichment**

In `app/src/handler/Market/index.js`, add this helper near the top of the file (after the `const moment` require):

```js
const UserModel = require("../../model/application/UserModel");

async function resolveDisplayName(userId) {
  if (!userId) return null;
  const profile = await UserModel.getProfile(userId).catch(() => null);
  if (profile && profile.displayName) return profile.displayName;
  return `User-${userId.slice(-4)}`;
}
```

Then replace the `show` function body. The current body looks like (around lines 15–34):

```js
exports.show = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.profile;
  const marketDetail = await MarketDetailModel.getById(id);

  if (!marketDetail) {
    return res.status(404).json({
      message: i18n.__("api.error.notFound"),
    });
  }

  const sellTargetList = get(marketDetail, "sell_target_list", []);
  if (!sellTargetList.includes(userId) && marketDetail.seller_id !== userId) {
    return res.status(403).json({
      message: i18n.__("api.error.forbidden"),
    });
  }

  res.json(marketDetail);
};
```

Change the final `res.json(marketDetail);` to:

```js
const buyerId = get(sellTargetList, "[0]", null);
const [sellerName, buyerName] = await Promise.all([
  resolveDisplayName(marketDetail.seller_id),
  resolveDisplayName(buyerId),
]);

res.json({
  ...marketDetail,
  seller_display_name: sellerName,
  buyer_display_name: buyerName,
});
```

(`star` is already in `marketDetail` from B1; no need to add it again.)

- [ ] **Step 4: Verify it passes**

```
cd app && yarn test -- __tests__/api/Market.show.test.js
```

Expected: PASS, 2/2.

- [ ] **Step 5: Full backend test sweep**

```
cd app && yarn test
```

Expected: existing tests still pass.

- [ ] **Step 6: Lint + commit**

```
cd app && yarn lint
cd .. && git add app/src/handler/Market/index.js app/__tests__/api/Market.show.test.js
git commit -m "feat(trade): enrich GET /api/market/:id with display names"
```

---

## Milestone C — Frontend shared

### Task C1: `Trade/_shared.js`

**Files:**
- Create: `frontend/src/pages/Trade/_shared.js`

- [ ] **Step 1: Implement**

Create `frontend/src/pages/Trade/_shared.js`:

```js
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

export const STATUS = {
  PENDING: 0,
  COMPLETED: 1,
  CANCELLED: -1,
};

export const STATUS_MAP = {
  [STATUS.PENDING]: {
    label: "未交易",
    color: "warning",
    icon: <HourglassEmptyIcon sx={{ fontSize: "14px !important" }} />,
  },
  [STATUS.COMPLETED]: {
    label: "已交易",
    color: "success",
    icon: <CheckCircleIcon sx={{ fontSize: "14px !important" }} />,
  },
  [STATUS.CANCELLED]: {
    label: "已取消",
    color: "default",
    icon: <CancelIcon sx={{ fontSize: "14px !important" }} />,
  },
};

export function fmtDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function getViewerRole(market, viewerUserId) {
  if (!market || !viewerUserId) return "guest";
  if (market.seller_id === viewerUserId) return "seller";
  const targets = Array.isArray(market.sell_target_list)
    ? market.sell_target_list
    : [];
  if (targets.includes(viewerUserId)) return "buyer";
  return "guest";
}

export const QUICK_PRICES = [100, 500, 1000, 5000, 10000];
```

- [ ] **Step 2: Update Manage.jsx to use shared module (refactor)**

`Manage.jsx` already defines a local `STATUS_MAP` and `fmtDate` (lines 27–49). Replace those local consts with an import:

```js
import { STATUS_MAP, fmtDate } from "./_shared";
```

Delete the local declarations. The rest of Manage.jsx already references `STATUS_MAP` and `fmtDate` by the same names, so no further code changes are required in that file.

- [ ] **Step 3: Sanity check**

```
cd frontend && yarn lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add frontend/src/pages/Trade/_shared.js frontend/src/pages/Trade/Manage.jsx
git commit -m "refactor(trade): extract shared status map + helpers"
```

---

### Task C2: Character picker drawer

**Files:**
- Create: `frontend/src/pages/Trade/CharacterPickerDrawer.jsx`

- [ ] **Step 1: Implement**

Create `frontend/src/pages/Trade/CharacterPickerDrawer.jsx`:

```jsx
import { useState } from "react";
import {
  SwipeableDrawer,
  Box,
  Typography,
  Grid,
  Card,
  CardActionArea,
  Avatar,
  Button,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

/**
 * Bottom-sheet character picker.
 * Props:
 *   open         - boolean
 *   onClose      - () => void
 *   items        - [{ itemId, name, headImage }]
 *   initialId    - itemId currently selected (may be null)
 *   onConfirm    - (itemId) => void
 */
export default function CharacterPickerDrawer({
  open,
  onClose,
  items,
  initialId,
  onConfirm,
}) {
  const [localId, setLocalId] = useState(initialId ?? null);

  const handleConfirm = () => {
    onConfirm(localId);
    onClose();
  };

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: "85dvh",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          pt: 2,
          pb: 1,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          選擇要交易的角色
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="關閉">
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", px: 2, pb: 1 }}>
        {items.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
            您目前沒有可交易的角色
          </Box>
        ) : (
          <Grid container spacing={1.5}>
            {items.map(item => {
              const selected = item.itemId === localId;
              return (
                <Grid size={{ xs: 4, sm: 3 }} key={item.itemId}>
                  <Card
                    sx={{
                      outline: selected ? "3px solid" : "1px solid",
                      outlineColor: selected ? "primary.main" : "divider",
                      transition: "outline-color 150ms",
                    }}
                  >
                    <CardActionArea onClick={() => setLocalId(item.itemId)}>
                      <Box sx={{ position: "relative", pt: "100%" }}>
                        <Avatar
                          variant="rounded"
                          src={item.headImage}
                          alt={item.name}
                          sx={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            borderRadius: 0,
                          }}
                        />
                      </Box>
                      <Box sx={{ p: 0.75 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            textAlign: "center",
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>
      <Box
        sx={{
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
        }}
      >
        <Button
          fullWidth
          variant="contained"
          disabled={localId == null}
          onClick={handleConfirm}
        >
          確定
        </Button>
      </Box>
    </SwipeableDrawer>
  );
}
```

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/Trade/CharacterPickerDrawer.jsx
git commit -m "feat(trade): add character picker bottom-sheet drawer"
```

---

## Milestone D — Order page

### Task D1: Rewrite Order page

**Files:**
- Modify: `frontend/src/pages/Trade/Order.jsx` (full rewrite)

- [ ] **Step 1: Replace file content**

Replace `frontend/src/pages/Trade/Order.jsx` with:

```jsx
import { useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  Avatar,
  Alert,
  Skeleton,
} from "@mui/material";
import HandshakeIcon from "@mui/icons-material/Handshake";
import DiamondIcon from "@mui/icons-material/Diamond";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { get } from "lodash";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useQuery from "../../hooks/useQuery";
import useLiff from "../../context/useLiff";
import CharacterPickerDrawer from "./CharacterPickerDrawer";
import { QUICK_PRICES } from "./_shared";

function Banner({ targetName }) {
  return (
    <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: { xs: 3, sm: 4 },
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          flexWrap: "wrap",
        }}
      >
        <HandshakeIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            與 {targetName} 交易
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            選一個角色，設定女神石價格
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default function TradeOrder() {
  const { loggedIn: isLoggedIn, liffContext } = useLiff();
  const navigate = useNavigate();
  const query = useQuery();
  const targetId = query.get("target_id");
  const viewerId = liffContext?.userId;

  const [selectedId, setSelectedId] = useState(null);
  const [charge, setCharge] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [{ data: targetProfile, loading: targetLoading }] = useAxios(
    targetId ? `/api/profile/${targetId}` : null,
    { manual: !isLoggedIn || !targetId }
  );
  const [{ data: inventoryItems = [], loading: invLoading }, fetchItems] = useAxios(
    "/api/inventory",
    { manual: true }
  );
  const [{ data: createResp, loading: createLoading, error: createErr }, createOrder] = useAxios(
    { url: "/api/trades", method: "POST" },
    { manual: true }
  );
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] =
    useHintBar();

  useEffect(() => {
    document.title = "交易申請";
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchItems();
  }, [isLoggedIn, fetchItems]);

  useEffect(() => {
    if (!targetId) handleOpen("未指定交易對象", "error");
  }, [targetId, handleOpen]);

  useEffect(() => {
    if (createErr) handleOpen(get(createErr, "response.data.message"), "error");
  }, [createErr, handleOpen]);

  useEffect(() => {
    if (createResp?.marketId) {
      navigate(`/trade/${createResp.marketId}`);
    }
  }, [createResp, navigate]);

  const selectedItem = useMemo(
    () => inventoryItems.find(i => i.itemId === selectedId),
    [inventoryItems, selectedId]
  );

  const targetName =
    targetProfile?.displayName ||
    (targetId ? `User-${targetId.slice(-4)}` : "未知對象");

  const isSelf = viewerId && targetId && viewerId === targetId;
  const chargeNum = Number(charge);
  const submittable =
    !isSelf &&
    selectedId != null &&
    Number.isFinite(chargeNum) &&
    chargeNum > 0 &&
    !createLoading;

  const handleSubmit = () => {
    if (!submittable) return;
    createOrder({
      data: { targetId, itemId: selectedId, charge: chargeNum },
    });
  };

  if (!isLoggedIn) return <AlertLogin />;

  const bannerNode =
    targetLoading || !targetProfile ? (
      <Skeleton variant="rounded" height={120} animation="wave" />
    ) : (
      <Banner targetName={targetName} />
    );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
        pb: "calc(env(safe-area-inset-bottom) + 80px)",
        minHeight: "100dvh",
      }}
    >
      {bannerNode}

      {isSelf && <Alert severity="error">您不能與自己進行交易。</Alert>}

      <Alert severity="warning" sx={{ borderRadius: 3 }}>
        <Typography variant="body2">
          1. 請確認交易對象已加入您的好友
        </Typography>
        <Typography variant="body2">
          2. 對方來自指令自動帶出，如果不是您要交易的對象請關閉視窗
        </Typography>
      </Alert>

      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="overline" color="text.secondary">
          角色
        </Typography>
        <Button
          fullWidth
          variant="outlined"
          size="large"
          disabled={isSelf || invLoading}
          onClick={() => setPickerOpen(true)}
          endIcon={<ChevronRightIcon />}
          sx={{
            mt: 1,
            justifyContent: "space-between",
            py: 1.5,
            textTransform: "none",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {selectedItem ? (
              <>
                <Avatar
                  variant="rounded"
                  src={selectedItem.headImage}
                  alt={selectedItem.name}
                  sx={{ width: 40, height: 40 }}
                />
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {selectedItem.name}
                </Typography>
              </>
            ) : (
              <Typography variant="body1" color="text.secondary">
                {invLoading ? "載入背包中…" : "點此選擇角色"}
              </Typography>
            )}
          </Box>
        </Button>
      </Paper>

      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="overline" color="text.secondary">
          女神石
        </Typography>
        <TextField
          fullWidth
          value={charge}
          onChange={e => setCharge(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={isSelf}
          inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
          InputProps={{
            startAdornment: (
              <DiamondIcon sx={{ mr: 1, color: "text.secondary" }} />
            ),
          }}
          placeholder="輸入要求金額"
          sx={{ mt: 1 }}
        />
        <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
          {QUICK_PRICES.map(p => (
            <Chip
              key={p}
              label={p >= 1000 ? `${p / 1000}k` : `${p}`}
              onClick={() => setCharge(String(p))}
              clickable
              disabled={isSelf}
              variant={String(p) === charge ? "filled" : "outlined"}
              color={String(p) === charge ? "primary" : "default"}
            />
          ))}
        </Box>
      </Paper>

      <Box
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          px: 2,
          pt: 1.5,
          paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
          display: "flex",
          gap: 1.5,
          zIndex: 10,
        }}
      >
        <Button
          fullWidth
          variant="outlined"
          color="secondary"
          size="large"
          onClick={() => window.history.back()}
        >
          取消
        </Button>
        <Button
          fullWidth
          variant="contained"
          color="primary"
          size="large"
          disabled={!submittable}
          onClick={handleSubmit}
        >
          送出交易
        </Button>
      </Box>

      <CharacterPickerDrawer
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={inventoryItems}
        initialId={selectedId}
        onConfirm={id => setSelectedId(id)}
      />

      <HintSnackBar
        open={snackOpen}
        message={message}
        severity={severity}
        onClose={handleClose}
      />
    </Box>
  );
}
```

(`TradeCreateResult` is removed entirely — replaced by navigating to `/trade/:id` which renders the new unified detail page.)

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

Expected: no errors. If lint flags `useEffect` deps, the existing repo style frequently silences these — match neighbouring files (`Manage.jsx`).

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/Trade/Order.jsx
git commit -m "feat(trade): rewrite order page with bottom-sheet picker and sticky bar"
```

---

### Task D2: Confirm Order → Detail navigation flows through new route

(Already wired in D1 via `navigate('/trade/' + marketId)`. This task is a manual checkpoint — no code, no commit. Confirm by reading D1's Order.jsx that:

- The post-create `useEffect` calls `navigate('/trade/${createResp.marketId}')` (no `/detail` suffix).

If the route in F1 isn't registered yet by the time you hit this checkpoint, that's fine — frontend manual QA is the H-milestone.

- [ ] **Step 1:** Read Order.jsx, confirm the `navigate` call uses `/trade/${marketId}` and **not** `/trade/${marketId}/detail`. No commit.

---

## Milestone E — Unified TradeDetail

### Task E1: TradeDetail scaffold + role + Skeleton

**Files:**
- Create: `frontend/src/pages/Trade/TradeDetail.jsx`

- [ ] **Step 1: Create file with role-aware skeleton**

Create `frontend/src/pages/Trade/TradeDetail.jsx`:

```jsx
import { useEffect } from "react";
import useAxios from "axios-hooks";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Paper, Typography, Skeleton, Alert, Button } from "@mui/material";
import liff from "@line/liff";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { getViewerRole } from "./_shared";

function PageSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Skeleton variant="rounded" height={140} animation="wave" />
      <Skeleton variant="rounded" height={200} animation="wave" />
      <Skeleton variant="rounded" height={160} animation="wave" />
    </Box>
  );
}

function ClosePanel() {
  const navigate = useNavigate();
  const handleClose = () => {
    if (liff.isInClient()) liff.closeWindow();
    else navigate("/trade/manage");
  };
  return (
    <Paper sx={{ p: 2, borderRadius: 3, textAlign: "center" }}>
      <Button variant="contained" onClick={handleClose}>
        關閉
      </Button>
    </Paper>
  );
}

export default function TradeDetail() {
  const { loggedIn: isLoggedIn, liffContext } = useLiff();
  const { marketId } = useParams();
  const [{ data: market, loading, error }, fetchMarket] = useAxios(
    `/api/market/${marketId}`,
    { manual: true }
  );

  useEffect(() => {
    document.title = "交易詳情";
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchMarket();
  }, [isLoggedIn, fetchMarket]);

  if (!isLoggedIn) return <AlertLogin />;
  if (loading || !market) return <PageSkeleton />;

  if (error) {
    const code = error.response?.status;
    const msg =
      code === 403
        ? "您無權檢視此交易"
        : code === 404
          ? "交易不存在"
          : "載入交易失敗";
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Alert severity="error">{msg}</Alert>
        <ClosePanel />
      </Box>
    );
  }

  const role = getViewerRole(market, liffContext?.userId);
  if (role === "guest") {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <Alert severity="error">您無權檢視此交易</Alert>
        <ClosePanel />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Typography>role: {role} | status: {market.status}</Typography>
    </Box>
  );
}
```

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/Trade/TradeDetail.jsx
git commit -m "feat(trade): scaffold unified TradeDetail page"
```

---

### Task E2: Banner + hero card + details card

**Files:**
- Modify: `frontend/src/pages/Trade/TradeDetail.jsx`

- [ ] **Step 1: Add banner + hero + details JSX**

In `TradeDetail.jsx`, add these helper components above `TradeDetail`:

```jsx
import RedeemIcon from "@mui/icons-material/Redeem";
import DiamondIcon from "@mui/icons-material/Diamond";
import StarIcon from "@mui/icons-material/Star";
import { Chip, Avatar } from "@mui/material";
import { STATUS, STATUS_MAP, fmtDate } from "./_shared";

function bannerCopy(role, status, marketId) {
  if (status === STATUS.COMPLETED) {
    return { title: `已成交 #${marketId}`, chipLabel: "已完成" };
  }
  if (status === STATUS.CANCELLED) {
    return {
      title: role === "seller" ? `已取消 #${marketId}` : "交易已取消",
      chipLabel: "已取消",
    };
  }
  // pending
  return {
    title: role === "seller" ? `委託 #${marketId}` : `交易邀請 #${marketId}`,
    chipLabel: role === "seller" ? "等待對方回覆" : "等你回覆",
  };
}

function Banner({ role, status, marketId }) {
  const { title, chipLabel } = bannerCopy(role, status, marketId);
  const statusInfo = STATUS_MAP[status] || STATUS_MAP[STATUS.CANCELLED];
  return (
    <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: { xs: 3, sm: 4 },
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          flexWrap: "wrap",
        }}
      >
        <RedeemIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Chip
              icon={statusInfo.icon}
              label={chipLabel}
              size="small"
              color={statusInfo.color}
              sx={
                statusInfo.color === "default"
                  ? { bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }
                  : undefined
              }
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function HeroCard({ market }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Avatar
          variant="rounded"
          src={market.image}
          alt={market.name}
          sx={{ width: 96, height: 96, borderRadius: 2 }}
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {market.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            道具編號 #{market.item_id}
          </Typography>
          {market.star > 0 && (
            <Box sx={{ display: "flex", mt: 0.5 }}>
              {Array.from({ length: market.star }).map((_, i) => (
                <StarIcon
                  key={i}
                  sx={{ color: "warning.main", fontSize: 18 }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ mt: 2, color: "text.secondary", fontSize: 14 }}>
        <strong>{market.seller_display_name || "賣方"}</strong>
        {" → "}
        <strong>{market.buyer_display_name || "買方"}</strong>
      </Box>
    </Paper>
  );
}

function DetailRow({ label, value, valueColor }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, color: valueColor || "text.primary" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function DetailsCard({ market, role, balance, balanceLoading }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <DetailRow
        label="金額"
        value={
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            <DiamondIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            {market.price.toLocaleString()}
          </Box>
        }
      />
      <DetailRow label="建立於" value={fmtDate(market.created_at)} />
      {role === "buyer" && (
        <>
          <DetailRow
            label="你的女神石"
            value={balanceLoading ? "…" : (balance ?? 0).toLocaleString()}
          />
          <DetailRow
            label="交易後"
            value={
              balanceLoading
                ? "…"
                : Math.max(0, (balance ?? 0) - market.price).toLocaleString()
            }
            valueColor={
              !balanceLoading && (balance ?? 0) < market.price
                ? "error.main"
                : undefined
            }
          />
        </>
      )}
    </Paper>
  );
}
```

Then replace the temporary `<Typography>role: ...</Typography>` body in the `TradeDetail` component with:

```jsx
return (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      gap: 2.5,
      pb: "calc(env(safe-area-inset-bottom) + 80px)",
      minHeight: "100dvh",
    }}
  >
    <Banner role={role} status={market.status} marketId={market.id} />
    <HeroCard market={market} />
    <DetailsCard market={market} role={role} balance={null} balanceLoading={false} />
  </Box>
);
```

(Buyer balance gets wired in E3; for now passes `null` / `false`.)

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/Trade/TradeDetail.jsx
git commit -m "feat(trade): add banner, hero, and details cards to TradeDetail"
```

---

### Task E3: Buyer balance fetch + insufficient alert

**Files:**
- Modify: `frontend/src/pages/Trade/TradeDetail.jsx`

- [ ] **Step 1: Fetch balance when viewer is buyer**

Inside the `TradeDetail` function, after the `useAxios` for market, add:

```jsx
const isBuyer = market
  ? getViewerRole(market, liffContext?.userId) === "buyer"
  : false;
const [{ data: stoneData, loading: stoneLoading }] = useAxios(
  "/api/inventory/total-god-stone",
  { manual: !isLoggedIn || !isBuyer }
);

const balance = stoneData?.total ?? null;
```

(Important: the `useAxios` `manual` flag must be set so the hook doesn't fire when viewer isn't a buyer.)

Pass these into `DetailsCard`:

```jsx
<DetailsCard
  market={market}
  role={role}
  balance={balance}
  balanceLoading={stoneLoading}
/>
```

Below the DetailsCard, add an inline alert when balance insufficient and viewer is buyer + status pending:

```jsx
{role === "buyer" &&
  market.status === STATUS.PENDING &&
  !stoneLoading &&
  balance != null &&
  balance < market.price && (
    <Alert severity="error" sx={{ borderRadius: 3 }}>
      女神石不足，無法完成這筆交易
    </Alert>
  )}
```

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/Trade/TradeDetail.jsx
git commit -m "feat(trade): show buyer balance and insufficient-funds alert"
```

---

### Task E4: Action footer per role × status

**Files:**
- Modify: `frontend/src/pages/Trade/TradeDetail.jsx`

- [ ] **Step 1: Add action handlers + footer**

At the top of TradeDetail.jsx, also import the share-payload generator (will be updated in G1, but still callable today):

```jsx
import { genNotify } from "../../flex/TradeNotify";
import AlertDialog from "../../components/AlertDialog";
import useAlertDialog from "../../hooks/useAlertDialog";
import useHintBar from "../../hooks/useHintBar";
import HintSnackBar from "../../components/HintSnackBar";
```

Inside `TradeDetail`, add handlers (place after the balance hook):

```jsx
const navigate = useNavigate();
const [{ loading: acceptLoading }, acceptTx] = useAxios(
  { method: "POST" },
  { manual: true }
);
const [{ loading: denyLoading }, denyTx] = useAxios(
  { method: "DELETE" },
  { manual: true }
);
const [
  alertState,
  { handleOpen: openAlert, handleClose: closeAlert },
] = useAlertDialog();
const [{ message, severity, open: snackOpen }, { handleOpen: openSnack, handleClose: closeSnack }] = useHintBar();

const closeAfterSuccess = () => {
  setTimeout(() => {
    if (liff.isInClient()) liff.closeWindow();
    else navigate("/trade/manage");
  }, 1500);
};

const handleAccept = () => {
  openAlert({
    title: "確認接受",
    description: `將花費 ${market.price} 女神石換取「${market.name}」，確定嗎？`,
    submitText: "確認接受",
    cancelText: "取消",
    onSubmit: async () => {
      closeAlert();
      try {
        await acceptTx({ url: `/api/market/${market.id}/transactions` });
        openSnack("交易成功", "success");
        closeAfterSuccess();
      } catch (e) {
        openSnack(e.response?.data?.message || "交易失敗", "error");
      }
    },
    onCancel: closeAlert,
  });
};

const handleDeny = () => {
  openAlert({
    title: "拒絕交易",
    description: `要拒絕「${market.name}」這筆交易嗎？`,
    submitText: "拒絕",
    cancelText: "取消",
    onSubmit: async () => {
      closeAlert();
      try {
        await denyTx({ url: `/api/market/${market.id}/transactions` });
        openSnack("已拒絕", "success");
        closeAfterSuccess();
      } catch (e) {
        openSnack(e.response?.data?.message || "操作失敗", "error");
      }
    },
    onCancel: closeAlert,
  });
};

const handleCancelOrder = () => {
  openAlert({
    title: "取消委託",
    description: `要取消「${market.name}」的委託嗎？`,
    submitText: "取消委託",
    cancelText: "返回",
    onSubmit: async () => {
      closeAlert();
      try {
        await denyTx({ url: `/api/market/${market.id}/transactions` });
        openSnack("已取消委託", "success");
        setTimeout(() => navigate("/trade/manage"), 1000);
      } catch (e) {
        openSnack(e.response?.data?.message || "操作失敗", "error");
      }
    },
    onCancel: closeAlert,
  });
};

const handleShare = () => {
  liff.shareTargetPicker([
    {
      type: "flex",
      altText: "交易邀請",
      contents: genNotify({
        marketId: market.id,
        name: market.name,
        image: market.image,
        charge: market.price,
        sellerName: liffContext?.displayName || "好友",
        star: market.star ?? 0,
      }),
    },
  ]);
};
```

Then build the footer below the (existing) cards inside the returned JSX:

```jsx
<Box
  sx={{
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    bgcolor: "background.paper",
    borderTop: "1px solid",
    borderColor: "divider",
    px: 2,
    pt: 1.5,
    paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
    display: "flex",
    gap: 1.5,
    zIndex: 10,
  }}
>
  {market.status !== STATUS.PENDING ? (
    <Button
      fullWidth
      variant="contained"
      onClick={() =>
        liff.isInClient() ? liff.closeWindow() : navigate("/trade/manage")
      }
      size="large"
    >
      關閉
    </Button>
  ) : role === "seller" ? (
    <>
      <Button
        fullWidth
        variant="outlined"
        color="error"
        size="large"
        onClick={handleCancelOrder}
        disabled={denyLoading}
      >
        取消委託
      </Button>
      <Button
        fullWidth
        variant="contained"
        color="primary"
        size="large"
        onClick={handleShare}
      >
        再次通知
      </Button>
    </>
  ) : (
    <>
      <Button
        fullWidth
        variant="outlined"
        color="secondary"
        size="large"
        onClick={handleDeny}
        disabled={denyLoading || acceptLoading}
      >
        拒絕
      </Button>
      <Button
        fullWidth
        variant="contained"
        color="primary"
        size="large"
        onClick={handleAccept}
        disabled={
          acceptLoading ||
          denyLoading ||
          (balance != null && balance < market.price)
        }
      >
        接受交易
      </Button>
    </>
  )}
</Box>

<AlertDialog
  open={alertState.open}
  title={alertState.title}
  description={alertState.description}
  submitText={alertState.submitText}
  cancelText={alertState.cancelText}
  onSubmit={alertState.onSubmit}
  onCancel={alertState.onCancel}
  onClose={closeAlert}
/>
<HintSnackBar
  open={snackOpen}
  message={message}
  severity={severity}
  onClose={closeSnack}
/>
```

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

- [ ] **Step 3: Commit**

```
git add frontend/src/pages/Trade/TradeDetail.jsx
git commit -m "feat(trade): add role-aware action footer to TradeDetail"
```

---

### Task E5: Delete old Detail.jsx + Transaction.jsx

**Files:**
- Delete: `frontend/src/pages/Trade/Detail.jsx`
- Delete: `frontend/src/pages/Trade/Transaction.jsx`

- [ ] **Step 1: Delete files**

```
rm frontend/src/pages/Trade/Detail.jsx frontend/src/pages/Trade/Transaction.jsx
```

(Routes in `App.jsx` still reference them — F1 fixes that. Don't lint between E5 and F1; the build will fail in this interim state and that's expected.)

- [ ] **Step 2: Commit**

```
git add -A frontend/src/pages/Trade
git commit -m "refactor(trade): remove obsolete Detail and Transaction pages"
```

---

## Milestone F — Routes

### Task F1: Rewire App.jsx routes

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Update imports**

In `frontend/src/App.jsx`, replace the lines (around 17–18):

```js
import TradeDetail from "./pages/Trade/Detail";
import TradeTransaction from "./pages/Trade/Transaction";
```

with:

```js
import TradeDetail from "./pages/Trade/TradeDetail";
import { Navigate } from "react-router-dom";
```

(`Navigate` is already part of `react-router-dom`; make sure the import line at the top of the file imports it once.)

- [ ] **Step 2: Replace the Trade route block**

Find:

```jsx
{/* Trade */}
<Route path="trade/order" element={<TradeOrder />} />
<Route path="trade/manage" element={<TradeManage />} />
<Route path="trade/:marketId/detail" element={<TradeDetail />} />
<Route path="trade/:marketId/transaction" element={<TradeTransaction />} />
```

Replace with:

```jsx
{/* Trade */}
<Route path="trade/order" element={<TradeOrder />} />
<Route path="trade/manage" element={<TradeManage />} />
<Route path="trade/:marketId" element={<TradeDetail />} />
<Route
  path="trade/:marketId/detail"
  element={<TradeDetail />}
/>
<Route
  path="trade/:marketId/transaction"
  element={<TradeTransaction />}
/>
```

Then define a small back-compat shim component above `App` (or inline in a `RedirectFromTransaction` helper) and use it as the `transaction` route element:

```jsx
import { useParams } from "react-router-dom";

function RedirectFromTransaction() {
  const { marketId } = useParams();
  return <Navigate to={`/trade/${marketId}`} replace />;
}
```

And change the `transaction` route to:

```jsx
<Route
  path="trade/:marketId/transaction"
  element={<RedirectFromTransaction />}
/>
```

(The old `?action=...` query is ignored on the new page, as designed.)

- [ ] **Step 3: Lint + build**

```
cd frontend && yarn lint && yarn build
```

Expected: lint clean; build succeeds (no missing imports).

- [ ] **Step 4: Commit**

```
git add frontend/src/App.jsx
git commit -m "feat(trade): unify /trade/:marketId route with legacy redirect shim"
```

---

## Milestone G — TradeNotify Flex bubble

### Task G1: Rewrite genNotify

**Files:**
- Modify: `frontend/src/flex/TradeNotify.js` (full rewrite)

- [ ] **Step 1: Replace file contents**

Replace `frontend/src/flex/TradeNotify.js`:

```js
import liff from "@line/liff";

/**
 * Single-CTA trade-invitation Flex bubble.
 * @param {Object} args
 * @param {number} args.marketId
 * @param {string} args.name           - character display name
 * @param {string} args.image          - character image url
 * @param {number} args.charge         - god-stone price
 * @param {string} args.sellerName     - seller's LINE display name
 * @param {number} [args.star]         - character rarity
 */
export const genNotify = ({ marketId, name, image, charge, sellerName, star = 0 }) => {
  const safeSellerName = sellerName || "好友";
  const starText = star > 0 ? "★".repeat(star) : "";

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: `👤 ${safeSellerName} 邀請你交易`,
          weight: "bold",
          flex: 5,
          wrap: true,
        },
        {
          type: "text",
          text: `#${marketId}`,
          align: "end",
          color: "#8c8c8c",
          flex: 2,
        },
      ],
      paddingAll: "lg",
      paddingBottom: "sm",
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "image",
              url: image,
              size: "full",
              aspectMode: "cover",
              aspectRatio: "1:1",
              flex: 2,
            },
            {
              type: "box",
              layout: "vertical",
              flex: 3,
              spacing: "xs",
              contents: [
                { type: "text", text: name, weight: "bold", size: "md", wrap: true },
                ...(starText
                  ? [{ type: "text", text: starText, size: "sm", color: "#FFB300" }]
                  : []),
              ],
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "金額", color: "#8c8c8c", size: "sm", flex: 2 },
                {
                  type: "text",
                  text: `💎 ${Number(charge).toLocaleString()}`,
                  size: "sm",
                  weight: "bold",
                  align: "end",
                  flex: 5,
                  color: "#129912",
                },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "限定讓售給", color: "#8c8c8c", size: "sm", flex: 2 },
                {
                  type: "text",
                  text: "你",
                  size: "sm",
                  align: "end",
                  flex: 5,
                  color: "#8c8c8c",
                },
              ],
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          contents: [{ type: "text", text: "查看交易", align: "center", color: "#ffffff" }],
          paddingAll: "md",
          backgroundColor: "#2C5F9B",
          cornerRadius: "md",
          action: {
            type: "uri",
            uri: `https://liff.line.me/${liff.id}/trade/${marketId}`,
          },
        },
      ],
    },
  };
};
```

- [ ] **Step 2: Lint**

```
cd frontend && yarn lint
```

- [ ] **Step 3: Commit**

```
git add frontend/src/flex/TradeNotify.js
git commit -m "feat(trade): redesign TradeNotify flex with single CTA"
```

---

### Task G2: Update callers (already passing new args in D1 and E4)

- [ ] **Step 1: Grep for all `genNotify` callers and confirm new args**

```
grep -rn "genNotify" frontend/src
```

Expected: only `pages/Trade/Order.jsx` (no longer — was removed in D1; the result-share button is gone now and lives on TradeDetail.jsx) and `pages/Trade/TradeDetail.jsx`.

Confirm `TradeDetail.jsx` (E4) passes `{ marketId, name, image, charge, sellerName, star }` — already done.

If any caller still passes the old shorthand `{ marketId, name, image, charge }`, the bubble renders with sellerName="好友" and no star — acceptable graceful degradation, but in this plan there are no other callers.

No code change in this task; this is a checkpoint. **No commit.**

---

## Milestone H — Verify & finalise

### Task H1: Full lint + test sweep

- [ ] **Step 1: Backend tests**

```
cd app && yarn test
```

Expected: all green.

- [ ] **Step 2: Backend lint**

```
cd app && yarn lint
```

Expected: clean.

- [ ] **Step 3: Frontend lint + build**

```
cd frontend && yarn lint && yarn build
```

Expected: clean lint and successful build.

- [ ] **Step 4: If anything fails, fix in place + amend the related task's commit (or add a small fix-up commit).**

---

### Task H2: Manual QA against tunnel

(No code; document the manual test plan executed and any findings as a follow-up if needed.)

- [ ] **Step 1: Bring up infra + dev + tunnel**

```
make infra
yarn dev      # in another terminal
make cf-go    # in another terminal
```

Restart the bot after `make cf-go` so the LIFF endpoint env updates.

- [ ] **Step 2: Order flow (seller, real device)**

1. In a LINE group, type `#交易 @<friend>`.
2. Tap the resulting action bubble.
3. LIFF opens — banner shows the friend's display name (not raw userId).
4. Tap the character picker — drawer opens; pick a character; the row updates with avatar + name.
5. Enter `1000`; tap the `1k` chip and confirm it stays selected.
6. Tap `送出交易` — page navigates to `/trade/:id`.
7. Banner shows `委託 #N`, status chip `等待對方回覆`; tap `再次通知`, share to the buyer test account.

- [ ] **Step 3: Buyer flow**

8. On the buyer test account, tap the shared bubble's `查看交易`.
9. LIFF opens — banner `交易邀請 #N` chip `等你回覆`; hero card shows the character; details show 金額 / 你的女神石 / 交易後.
10. If balance < price, accept button should be disabled with a red alert.
11. Top up if needed; tap `接受交易`; AlertDialog confirms; tap 確認 — toast shows success, window closes.

- [ ] **Step 4: Seller cancel flow**

12. Build another commission; in `#交易管理`, tap the gear; tap `取消委託`; AlertDialog confirms; ok — toast then navigate back to manage list.

- [ ] **Step 5: Edge cases**

13. Visit `/trade/<bogus-id>` — see `交易不存在` alert.
14. Visit `/trade/<id-not-addressed-to-you>` — see `您無權檢視此交易`.
15. Visit an old `?action=transaction` URL — confirm it redirects and does **not** auto-fire a confirm dialog.

- [ ] **Step 6: Final commit (notes only, if anything updated)**

If H2 surfaced no fixes, no commit. If a small fix was needed, commit it with `fix(trade): <what>`.

---

## Self-Review Notes

- **Spec coverage:**
  - Spec §1 (Routing) ↔ F1
  - Spec §2 (Order page) ↔ C2, D1
  - Spec §3 (TradeDetail) ↔ E1–E4
  - Spec §4 (TradeNotify) ↔ G1, G2
  - Spec §5.1 (Profile resolver) ↔ A1, A2, A3
  - Spec §5.2 (Market enrichment) ↔ B1, B2
  - Spec §6 (Icons) ↔ D1, E1–E4 (specific icons named)
  - Spec §7 (A11y/mobile) ↔ D1 (inputMode/dvh/safe-area), C2 (drawer touch targets), E1–E4 (sticky bar with safe-area)
  - Spec §8 (File list) ↔ Tasks 1:1 covered

- **Type consistency:** all task signatures align — `getProfile`, `getViewerRole`, `genNotify({ marketId, name, image, charge, sellerName, star })`. No drift.

- **Placeholder scan:** Each step contains the actual code/command. No TODO/TBD.
