# `#交易` Flow — LIFF Redesign + TradeNotify Flex Refresh

**Date:** 2026-05-20
**Status:** Draft — pending implementation
**Branch:** `feat/trade-flow-redesign` (planned)

## Context

The `#交易` command lets a player offer one of their characters (gacha pool item) to a specific group member in exchange for 女神石. The full chain:

1. **Group chat** — `#交易 @bob` → bot replies with a CTA bubble linking to LIFF
2. **LIFF Order** — seller picks a character + sets price → POST `/api/trades`
3. **Manual share** — seller invokes `liff.shareTargetPicker` to deliver a TradeNotify Flex bubble to the buyer
4. **LIFF Transaction** — buyer taps 接受/拒絕 in the Flex → confirms in LIFF → POST/DELETE `/api/market/:id/transactions`
5. **LIFF Manage** — seller can review/cancel pending commissions

During the broader card-style UI overhaul that landed across `Bag`, `Manage`, `XpHistory`, etc., only `Manage.jsx` in the Trade module got refreshed. The other three pages (`Order.jsx`, `Detail.jsx`, `Transaction.jsx`) and the TradeNotify Flex bubble were left behind and now visibly clash:

| Surface | Live state | Problem |
|---|---|---|
| `Order.jsx` | Plain MUI `Grid` + native `<select>`; target user shown as raw `userId` string in a disabled `TextField` | No character preview before submit; no human name for buyer; no price quick-picks |
| `Detail.jsx` | Raw `<img>`, ad-hoc `Paper` layout, no status header | Looks abandoned next to `Manage.jsx` |
| `Transaction.jsx` | Whole page is blank — only an `AlertDialog` pops with text "您將要花費 X 元 買入 Y" | Buyer commits 女神石 without seeing the character; no balance preview |
| `TradeNotify` Flex (`frontend/src/flex/TradeNotify.js`) | `#56FF56`/`#FF5656` action buttons at ~3:1 contrast | Below WCAG AA; double action (accept/deny) inside chat raises mis-tap risk for money flows |

The owner has asked for a redesign that brings these surfaces in line with the existing card style (`Manage.jsx`, `Bag.jsx` are the reference points) and improves the trust signals for a money-bearing flow. Underlying business logic — schema, API, transaction integrity — is **not** being changed.

## Goals

- Bring `Order`, `Detail`, and `Transaction` LIFF pages to parity with the existing card-style design language (gradient banner + Paper rounded cards + chips + Skeleton loaders).
- Replace blind dialog confirmation on the buyer side with a full-page checkout-style view that previews the character and the buyer's balance impact before commitment.
- Collapse the build-success result page and the seller-view `Detail` into a single shell, branching by viewer role (seller vs buyer); the same shell also serves as the post-share destination for buyers.
- Redesign the TradeNotify Flex bubble to (a) meet WCAG AA contrast and (b) funnel both accept/deny through the LIFF shell so users see full context before any irreversible click.
- Improve mobile form ergonomics: numeric keyboard on price, ≥44×44 touch targets, safe-area-aware sticky action bar, `dvh` over `vh`.
- Resolve target user from raw `userId` to a display name in the Order page.

## Non-Goals

- Schema changes. The `market_detail` and `trade_history` tables stay as-is.
- `OrderBased` router or backend transaction logic in `MarketController.transaction` / `MarketController.cancel`.
- The "申請" action bubble emitted by `genActionBubble` (shared across many features) — leave it alone.
- `Manage.jsx` redesign. It is already on the new system.
- Adding a buyer-side "trade inbox" or push notification. Manual share remains the delivery channel (LINE platform constraint).
- Switching icon library or visual style globally. We continue to use MUI Material Icons and the existing primary palette.

## Design

### 1. Routing

Current routes:

| Path | Page | Used for |
|---|---|---|
| `/trade/order?target_id=:uid` | `Order` | Seller builds a commission |
| `/trade/manage` | `Manage` | Seller lists own commissions |
| `/trade/:marketId/detail` | `Detail` | Seller reviews/cancels a single commission |
| `/trade/:marketId/transaction?action=transaction\|deny` | `Transaction` | Buyer accepts/rejects |

New routes:

| Path | Page | Used for |
|---|---|---|
| `/trade/order?target_id=:uid` | `Order` (redesigned) | unchanged route, redesigned page |
| `/trade/manage` | `Manage` | unchanged |
| `/trade/:marketId` | `TradeDetail` (unified) | Both seller-view and buyer-view; branches on `marketData.seller_id === liffContext.userId` |
| `/trade/:marketId/transaction?action=...` | redirect → `/trade/:marketId` (preserve `action` query but ignore for auto-dialog) | back-compat shim while old TradeNotify bubbles are still in circulation |

After successful build in Order, navigate to `/trade/:marketId` (replaces the inline `TradeCreateResult`). `Detail.jsx` and `Transaction.jsx` are deleted; `TradeDetail.jsx` is the single new file.

### 2. Order page (`frontend/src/pages/Trade/Order.jsx`)

```
┌─────────────────────────────────────────┐
│ gradient banner  (primary.dark→primary.main)
│ <HandshakeIcon 48px white>              │
│ 與 {targetDisplayName} 交易             │
│ 選一個角色、設女神石價格               │
│ Chip: 草稿                              │
└─────────────────────────────────────────┘

┌─ Paper rounded card ────────────────────┐
│ 角色                                    │
│ ┌────────────────────────────────────┐  │
│ │ [avatar] {selectedName} or "點此選" │  │  ← clickable row, opens drawer
│ └────────────────────────────────────┘  │
└─────────────────────────────────────────┘

┌─ Paper rounded card ────────────────────┐
│ 女神石                                  │
│ <TextField                              │
│   inputProps={{ inputMode: 'numeric',   │
│                 pattern: '[0-9]*' }}    │
│   InputProps={{                         │
│     startAdornment: <DiamondIcon/>      │
│   }}                                    │
│ />                                      │
│ Chip row: [100][500][1k][5k][10k]       │
│   each chip onClick sets value          │
└─────────────────────────────────────────┘

┌─ Alert info × 2 (unchanged copy) ───────┐

┌─ sticky bottom bar (safe-area-aware) ───┐
│ [取消]   [送出交易]                     │
└─────────────────────────────────────────┘
```

**Behaviour details:**

- `targetDisplayName` is fetched from new endpoint `GET /api/profile/:userId` (see §5) on mount; falls back to last 4 chars of `userId` when the profile lookup fails.
- The character picker is a `SwipeableDrawer anchor="bottom"`. Body is a `Grid` of `CharacterCard` (re-used from `Bag.jsx` if practical, otherwise a near-identical local component). Tapping a card sets local state and closes the drawer.
- Inventory list comes from existing `GET /api/inventory`; only items the user currently owns are shown.
- Submit button is disabled when `selectedItemId == null`, `charge <= 0`, or `userId === targetId`.
- Submit POSTs to `/api/trades` (unchanged contract: `{ targetId, itemId, charge }`).
- On 200, `navigate('/trade/' + response.marketId)`.
- On error, surface message via existing `HintSnackBar`.
- Sticky bar uses `position: sticky; bottom: 0` with `paddingBottom: 'env(safe-area-inset-bottom)'`; the page wrapper uses `min-h-dvh`.

### 3. Unified Detail page (`frontend/src/pages/Trade/TradeDetail.jsx`)

Single shell serves seller and buyer; viewer role determines the action footer and the details card extras.

**Shell layout:**

```
┌─ gradient banner ───────────────────────┐
│ <RedeemIcon 48px white>                 │
│ {title}                                 │
│ Chip {status label + icon}              │
└─────────────────────────────────────────┘

┌─ Hero card (Paper rounded) ─────────────┐
│ ┌─────────────┐  {character_name}       │
│ │  big avatar │  道具編號 #{item_id}    │
│ │  square     │  Chip ★×N (from         │
│ └─────────────┘    attributes.star)     │
│                                         │
│ 賣方 {seller_name} ──→ 買方 {buyer_name}│
└─────────────────────────────────────────┘

┌─ Details card (Paper rounded) ──────────┐
│ Row: 金額            <DiamondIcon> 1,000│
│ Row: 建立於          2026-05-20 14:32   │
│ (seller-only) Row: 對方 ID             │
│ (buyer-only)  Row: 你的女神石  💎 5,420 │
│ (buyer-only)  Row: 交易後      💎 4,420 │
│ (buyer + insufficient) Alert severity=  │
│   "error" — 女神石不足                  │
└─────────────────────────────────────────┘

┌─ sticky bottom bar ─────────────────────┐
│ {action buttons by role/status}         │
└─────────────────────────────────────────┘
```

**Title / Chip per state:**

| Viewer | `status` | Banner title | Chip |
|---|---|---|---|
| seller | 0 | `委託 #{id}` | warning · 等待對方回覆 |
| seller | 1 | `已成交 #{id}` | success · 已成交 |
| seller | -1 | `已取消 #{id}` | default · 已取消 |
| buyer | 0 | `交易邀請 #{id}` | warning · 等你回覆 |
| buyer | 1 | `已完成 #{id}` | success · 已完成 |
| buyer | -1 | `交易已取消` | default · 已取消 |

**Action footer:**

| Viewer | `status` | Buttons |
|---|---|---|
| seller | 0 | `取消委託` (secondary, opens `<AlertDialog>` confirm → `DELETE /api/market/:id/transactions` → snackbar → `navigate('/trade/manage')`) · `再次通知` (primary, opens `liff.shareTargetPicker` with the redesigned `genNotify`) |
| seller | 1 / -1 | `關閉` (closes LIFF if in client, else `navigate('/trade/manage')`) |
| buyer | 0 | `拒絕` (secondary, `<AlertDialog>` confirm → `DELETE`) · `接受交易` (primary, `<AlertDialog>` confirm → `POST`; disabled when balance < price) |
| buyer | 1 / -1 | `關閉` |

**Auto-dialog behaviour removed.** The old `?action=transaction` / `?action=deny` URL contract auto-fires a dialog on mount. The new page ignores the `action` query and waits for explicit button taps. This is a deliberate UX shift: every commitment passes through (a) seeing the character, (b) reading the balance impact, then (c) the existing AlertDialog confirm. Mis-taps in chat no longer flow straight to a commit.

**Buyer balance fetch.** A buyer-side render fetches `GET /api/inventory/total-god-stone` (already used by `Bag.jsx`) to compute "你的女神石" and "交易後"; if `total < price`, the Accept button is `disabled` and the alert renders.

**Authorization & error paths.** API `GET /api/market/:id` returns 403 when current user is neither seller nor in `sell_target_list`. UI renders an `Alert severity="error"` "您無權檢視此交易" inside the shell instead of the banner/cards; bottom bar shows only a `關閉` button. 404 renders "交易不存在". No silent redirect.

**Loading state.** Skeleton: banner box (`height={140}`), hero card (`height={180}`), details card (`height={140}`) — mirrors the `BagSkeleton` / `ManageSkeleton` pattern.

### 4. TradeNotify Flex bubble (`frontend/src/flex/TradeNotify.js`)

Single CTA card. Both 接受 and 拒絕 routes through LIFF.

```
┌──── TradeNotify bubble ────┐
│ Header (no bg)             │
│   👤 {sellerName} 邀請你交易│
│                       #1234│
│ ─────────────────────────  │
│ Body                       │
│   ┌──────┐  {character名稱}│
│   │image │  ★×N            │
│   └──────┘                 │
│                            │
│   金額       💎 {price}    │
│   限定讓售給  你            │
│                            │
│   ┌─ button ─────────┐    │
│   │   查看交易        │    │
│   └──────────────────┘    │
│   action: uri              │
│     liff.line.me/.../trade │
│     /{marketId}            │
└────────────────────────────┘
```

**Generator signature change.** Current `genNotify({ marketId, name, image, charge })` is extended to `genNotify({ marketId, name, image, charge, sellerName, star })`. `sellerName` is read from `useLiff().profile.displayName` (the sharer, populated by `LiffProvider`); `star` comes from the §5.2 enriched response. Both have safe fallbacks (`"好友"`, `0`).

**Colour adjustments:**

- Button background: theme primary (`#2C5F9B` — confirmed against the existing palette in `Manage.jsx` `theme.palette.primary.main`); text `#ffffff`. Verified ≥4.5:1 against the chosen primary in light mode.
- Meta text grey upgraded from `#b7b7b7` to `#8c8c8c` (~4.6:1 on white).
- Header divider: thin separator `#e5e5e5`.

**Deep link URL** unchanged target but new path: `https://liff.line.me/{liff.id}/trade/{marketId}` (drops `/transaction?action=...`). The old URL still works via the redirect shim in §1 so legacy bubbles sent before the deploy continue to function.

### 5. Backend additions

#### 5.1 `GET /api/profile/:userId` (new)

Returns `{ userId, displayName, pictureUrl }` for any LINE userId.

Resolution order (mirrors the existing `setProfile` middleware in `app/src/middleware/profile.js`):

1. **Redis** key `profile:{userId}` (30 min TTL) — the same key the chat-side middleware writes; most active users are already cached.
2. **MySQL `user` table** — falls back to `display_name` / `picture_url` columns. Requires a small addition to `UserModel`: new `exports.getProfile(platformId)` that selects `display_name, picture_url` by `platform_id`. (`UserModel` today only exposes `getId` / `updateProfile` / `ensureUser`.)
3. **LINE API** — `lineClient.getProfile(userId)` with the same ~200 ms timeout as the middleware. On success, write back to Redis (`profile:{userId}`, 30 min) and to MySQL via `UserModel.updateProfile`.
4. **Fallback** — if all three miss, return `{ userId, displayName: 'User-' + userId.slice(-4), pictureUrl: null }`. Never 5xx.

Rate-limited by the existing `/api` token middleware (`verifyToken`); no extra auth needed.

Used by:
- `Order.jsx` to resolve `target_id` → display name
- `TradeDetail.jsx` to resolve `seller_id` and `sell_target_list[0]` → names

Implementation lives in a new `app/src/handler/Profile/index.js`, wired up in `app/src/router/api.js`.

#### 5.2 `GET /api/market/:id` response enrichment (revised)

The existing handler (`MarketController.show`) gains three computed fields in the response:

```
{ ...marketDetail,
  seller_display_name: '...',
  buyer_display_name: '...',   // sell_target_list[0]
  star: N                        // from GachaPool.star
}
```

`star` is sourced by extending the existing `MarketDetailModel.getById` SELECT to also pull `GachaPool.star` through the same `leftJoin("GachaPool", "GachaPool.ID", "item_id")` already in place. Profile names use the resolver in §5.1. No DB schema change.

### 6. Icons and visual tokens

| Surface | Icon | Why |
|---|---|---|
| Order banner | `<HandshakeIcon>` from `@mui/icons-material` | Existing icon set; semantic match |
| Detail banner | `<RedeemIcon>` | Reads as "a deal/offer" |
| 女神石 amount | `<DiamondIcon>` | Same icon used by `Bag.jsx` for consistency |
| Empty / not-owned | `<InventoryIcon>` | Consistent with Bag.jsx empty state |
| Status chips | `HourglassEmptyIcon` / `CheckCircleIcon` / `CancelIcon` | Re-used from `Manage.jsx`'s `STATUS_MAP` — same `STATUS_MAP` const will be lifted to `frontend/src/pages/Trade/_shared.js` |

Flex bubble keeps emoji (`👤`, `💎`) because LINE Flex does not support inline SVG. This is the documented exception.

### 7. Accessibility & mobile ergonomics

- Touch targets: every chip, picker row, and button rendered at `≥ 44 × 44 CSS px`. MUI `Button size="large"` (40px high) is bumped with `py: 1.5`.
- Numeric input: `inputMode="numeric"`, `pattern="[0-9]*"` on the price field.
- Safe areas: sticky bars use `paddingBottom: 'env(safe-area-inset-bottom)'`.
- Viewport units: layouts use `100dvh` / `min-h-dvh` instead of `vh`.
- Focus rings: MUI defaults retained; no `outline: none` overrides.
- Reduced motion: drawer slide-in is the only motion; MUI `SwipeableDrawer` respects `prefers-reduced-motion` by default.
- Colour contrast: all primary-on-white text verified ≥4.5:1 against the project palette; chip colours inherit theme.

### 8. File-level change list

```
frontend/src/pages/Trade/
  Order.jsx           rewrite
  TradeDetail.jsx     new (replaces Detail.jsx and Transaction.jsx)
  Detail.jsx          delete
  Transaction.jsx     delete
  _shared.js          new — STATUS_MAP, formatDate, viewer-role helper

frontend/src/flex/
  TradeNotify.js      rewrite

frontend/src/App.jsx (or wherever routes are wired)
  /trade/:marketId/detail              → keep as alias of new /trade/:marketId
  /trade/:marketId/transaction         → redirect shim → /trade/:marketId

app/src/handler/Profile/
  index.js            new — GET /:userId handler

app/src/router/api.js
  + router.get('/profile/:userId', verifyToken, profileHandler)

app/src/model/application/UserModel.js
  + exports.getProfile(platformId) — selects display_name, picture_url by platform_id

app/src/handler/Market/index.js
  show()              + seller_display_name / buyer_display_name / star enrichment

app/src/model/application/MarketDetail.js
  getById()           + select GachaPool.star
```

No backend route is removed. No schema migration.

## Test Plan

Backend (Jest under `app/__tests__/`):

- `Profile` handler: hit on a cached userId, on an uncached userId (mock `lineClient.getProfile`), on a profile-API failure (returns fallback).
- `MarketController.show`: extends an existing test to assert the new enrichment fields are present and that `attributes.star` is read out.
- Existing `transaction` / `cancel` tests untouched; they should pass without modification.

Frontend (no test runner today — manual checklist):

- Order: open with valid `target_id`, see target name resolved; pick a character via drawer; tap each chip and confirm value sync; submit; arrives at `/trade/:id` post-build.
- TradeDetail seller-view (status 0): renders banner + hero + details; "再次通知" opens share picker; "取消委託" confirms then routes to `/trade/manage`.
- TradeDetail buyer-view (status 0): renders banner + hero + balance rows; with sufficient balance accept flow completes; with insufficient balance accept button disabled and red alert shown.
- TradeDetail status 1/-1 (both viewers): single 關閉 button; no action affordances.
- Auth: opening a `marketId` not addressed to current user shows 403 message inline.
- Redirect shim: old `/trade/:id/transaction?action=transaction` lands on `/trade/:id` without auto-firing the dialog.
- TradeNotify: render in LINE sandbox, verify single CTA, verify contrast, verify deep link target.

Manual verification runs against `make infra` + `yarn dev` + `make cf-go` to expose the LIFF endpoint.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Legacy TradeNotify bubbles in circulation still hit `?action=...` URLs | Redirect shim in §1; the `action` query is parsed but ignored, no auto-dialog |
| Profile API rate limits on LINE side if many concurrent Detail loads | Reads go through the existing cache table first; live calls only on miss |
| `attributes` JSON field shape may vary for older items | Star resolver tolerates missing/malformed JSON, defaults to 0 |
| Sticky bottom bar overlapping LINE's in-app browser toolbar on Android | `env(safe-area-inset-bottom)` + `dvh`; tested in `make cf-go` LIFF preview |
| Removing auto-dialog changes muscle memory for power users | One extra tap (the explicit button) is acceptable for money-bearing actions; the redesigned UI surfaces enough context to make the choice obvious without the dialog auto-firing |

## Out of scope (deferred)

- Buyer-side "Inbox" for pending trades sent to them — LINE platform pushes are off, and we don't want a separate poll. Manual share remains.
- `Manage.jsx` list row enrichment with character name/image (currently shows `商品 #N`). Nice-to-have; out of this slice.
- Internationalisation of the new copy beyond zh-TW. Existing pages are not localised.
