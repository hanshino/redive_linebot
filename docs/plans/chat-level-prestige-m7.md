# M7 — Controller cleanup

**Goal:** Strip the legacy admin commands and title-driven flows out of `ChatLevelController` / `Me` template, replace them with prestige-aware status flags, and add two new pure-query slash commands (`!等級`, `!轉生狀態`). The Lv.100 broadcast CTA itself is already wired in M3's pipeline post-write hook (`pipeline.js:163-168`); M7 only consumes the status fields it produces.

**Branch:** `feat/clp-m7` off `feat/chat-level-prestige`

## Architecture

- `ChatLevelController.showStatus` (`#我的狀態 / /me`) reads new `chat_user_data` schema directly via `ChatUserData.findByUserId` — no more legacy `user.id ↔ cud.id` join. Drops `range`/`rank` title fields. Computes prestige flags inline (awakened / active trial / honeymoon / prestige count).
- `Me/Profile.js` template loses range/rank, gains a status-flag row underneath the level pill.
- `showRank` (`#等級排行`) and `showFriendStatus` (`#狀態 @user`) rewritten to query new schema (no titles, just level + prestige indicator).
- Two new slash commands `!等級` / `!轉生狀態` for terse text queries — wired into `OrderBased` router in `app.js`.
- Admin commands `setEXP`, `setEXPRate` deleted from controller + admin router. Their backing `ChatLevelModel.setExperience` / `setExperienceRate` write to obsolete columns and are dead against new schema; the model functions stay (cheap to leave, M11 cleanup) but routing is removed.
- `ChatLevelTemplate` (the legacy flex `showStatus`) is unused after M6 — leave it to avoid scope creep; M11 can drop it.

## Status flags (冒險小卡)

Per spec line 295:

| Condition | Flag |
|---|---|
| `prestige_count >= 5` | `✨ 覺醒者` |
| `active_trial_id != null` | `⚔️ ★N 試煉中` |
| `prestige_count === 0` (and not awakened) | `🌱 蜜月中` |
| `1 <= prestige_count < 5` | `★ × prestige_count + 轉生 N 次` |

Multiple flags can stack: e.g. `★★★ 轉生 3 次` + `⚔️ ★4 試煉中`. Awakened players never show `★N 試煉中` (cap reached, no more trials).

## Files

| File | Action |
|---|---|
| `app/src/controller/application/ChatLevelController.js` | Refactor `showStatus` / `showRank` / `showFriendStatus`; remove `setEXP` / `setEXPRate`; add `showLevelOneLine` / `showPrestigeStatus` |
| `app/src/templates/application/Me/Profile.js` | Replace `Lv.${level} · ${range}` pill with `Lv.${level}` pill + status flag row |
| `app/src/app.js` | Drop admin routes (`setexp` / `setrate`); add `!等級` / `!轉生狀態` text matchers in `OrderBased` |
| `app/src/templates/application/Me/__tests__/Profile.test.js` | New — flag-row render coverage for each prestige state |

## Tasks

1. **Refactor `showStatus`** to use new schema: `ChatUserData.findByUserId` + `UserBlessing.listBlessingIdsByUserId` (for awakened build tag, optional in card) + `ChatExpUnit.all` for level threshold lookup. Compute `flags` payload, pass to `MeTemplate`. Drop `range`, `rank`, `ranking` fields.
2. **Rebuild `Me/Profile` hero**: drop range from level pill (`Lv.${level}`), drop `Rank #${ranking}` row, add a status-flag row sitting between hero and exp bar. Backwards-compatible signature: accept new `flags` array, ignore deprecated `range` / `ranking` if still passed.
3. **Refactor `showRank`** (`#等級排行`): query new `chat_user_data` ordered by lifetime XP (`prestige_count * 27000 + current_exp`) DESC, top-5, render text "1. Lv.85 ★★★ 轉生 3 次" with displayName.
4. **Refactor `showFriendStatus`** (`#狀態 @user`): query mentioned users from new schema, render text rows `1. 名字  Lv.85  ★★★ 轉生 3 次`.
5. **Delete `setEXP` / `setEXPRate`** exports + admin routes.
6. **Add `showLevelOneLine`** (`!等級`) and **`showPrestigeStatus`** (`!轉生狀態`) controllers + routes:
   - `!等級` → `「{name} · Lv.85 ★★★ 轉生 3 次 ⚔️ ★4 試煉中」` (one line, single user query)
   - `!轉生狀態` → multi-line: 轉生次數、覺醒/蜜月狀態、active trial 進度、已取得祝福數
7. **Tests**: `Me/Profile.test.js` snapshot-style render tests covering flag combinations (none, honeymoon, active trial, prestige count, awakened, awakened + flags stacked).

## Exit Criteria

- `yarn test` passes (new Profile tests + no regressions)
- `yarn lint` clean
- Manual: `/me` renders without title text and shows correct flags for: fresh user (蜜月), prestige 3 user, active trial user, awakened user
- `#等級排行` returns top-5 text with prestige indicators
- `!等級` and `!轉生狀態` respond correctly
- `.setexp` / `.setrate` no longer matched (silently ignored — fall through to alias / customer-order routers)

## Out of Scope

- Custom title self-selection (稱號自選): system removed entirely in M1, no command to delete
- Lv.100 CTA broadcast wiring: already in M3 pipeline post-write hook
- LIFF rankings page: covered in M6 (`PrestigeRankList.jsx`)
- Cleanup of dead `ChatLevelModel` methods + `ChatLevelTemplate` flex builder: deferred to M11

**Dependencies:** M3 (`ChatUserData` model, `PrestigeService.getPrestigeStatus`, broadcast queue)
