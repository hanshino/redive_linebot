---
name: 布丁機器人 (Pudding Bot)
description: Princess Connect Re:Dive LINE bot — phone-first LIFF pages and LINE Flex cards in Miyako cyan and pudding caramel.
colors:
  miyako-cyan: "#007C89"
  miyako-cyan-light: "#00ACC1"
  miyako-cyan-deep: "#005F69"
  pudding-caramel: "#B45309"
  pudding-amber: "#F59E0B"
  caramel-deep: "#92400E"
  ink: "#1A2332"
  ink-muted: "#5A6B7F"
  mist: "#F5F7FA"
  paper: "#FFFFFF"
  surface-inset: "#EEF2F6"
  cyan-hairline: "rgba(0, 172, 193, 0.12)"
  error: "#DC2626"
  success: "#15803D"
  stage-night: "#0A1A2A"
  stage-panel: "#12243A"
  stage-raised: "#1A2E4A"
  stage-button: "#2D4068"
  stage-text: "#E8EEF4"
  stage-text-muted: "#B0BEC5"
  stage-accent: "#FBBF24"
  night-cyan: "#26C6DA"
  night-amber: "#FBBF24"
  rarity-common: "#616161"
  rarity-rare: "#5B4BC4"
  rarity-epic: "#8A6100"
  rarity-legendary: "#C2185B"
  medal-gold: "#FFD700"
  medal-silver: "#C0C0C0"
  medal-bronze: "#CD7F32"
  currency-bg: "#FFF7E6"
typography:
  headline:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.235
  title-page:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.334
  title:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.6
  title-section:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.75
  body:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.66
  button:
    fontFamily: "Roboto, \"Noto Sans TC\", \"Helvetica Neue\", Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.75
rounded:
  base: "12px"
  lg: "24px"
  hero: "36px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  section-gap: "14px"
  md: "16px"
  card-pad-wide: "20px"
  lg: "24px"
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.miyako-cyan}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.base}"
    height: "{spacing.touch-min}"
  button-primary-hover:
    backgroundColor: "{colors.miyako-cyan-deep}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.pudding-caramel}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.base}"
    height: "{spacing.touch-min}"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.base}"
    height: "{spacing.touch-min}"
  button-text:
    textColor: "{colors.miyako-cyan}"
    typography: "{typography.button}"
    rounded: "{rounded.base}"
    height: "{spacing.touch-min}"
  section-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "16px"
  page-hero:
    backgroundColor: "{colors.miyako-cyan}"
    textColor: "{colors.paper}"
    typography: "{typography.title-page}"
    rounded: "{rounded.hero}"
    padding: "20px"
  bottom-nav:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    height: "56px"
  bottom-nav-active:
    textColor: "{colors.miyako-cyan}"
  flex-stage-card:
    backgroundColor: "{colors.stage-night}"
    textColor: "{colors.stage-text}"
  flex-stage-button:
    backgroundColor: "{colors.stage-button}"
    textColor: "{colors.stage-text}"
---

# Design System: 布丁機器人 (Pudding Bot)

## Overview

**Creative North Star: "Miyako's Pudding Counter"**

Two surfaces, one identity. The LIFF pages and the LINE Flex cards both draw from Miyako's palette: her cyan hair carries the working color, and the caramel layer of a pudding carries the warm second voice. Light is the default world. Pages are white paper on a pale mist background with cyan hairlines; Flex cards are light bubbles. There is one exception: a single dark "stage" surface for cards that read as a game scene (world boss, janken duel, horse race), so battle moments feel like a different room in the same house.

The system is an operating tool, not a showcase. It is phone-first inside LINE LIFF, dense but legible, written in zh-TW addressing the player as 你. Layout does the explaining: titles, numbers and state carry the meaning, and secondary labels or descriptions appear only when the layout alone cannot. Honesty beats tidiness: a failed load never masquerades as an empty list or a default value, and a missing star count renders nothing rather than a fake "1".

Accessibility is built into the tokens, not added later. Every `main` color passes 4.5:1 as text and under white button text; the brighter `light` shades are decoration only. Touch targets are at least 44px, text is at least 12px.

**Key Characteristics:**
- Light Miyako cyan primary (text/fill) with a brighter cyan reserved for decoration, borders and charts.
- Pudding caramel as the secondary voice: currency, sponsorship, race, god stones.
- Flat white cards with cyan hairlines; lift only on cards that are actually clickable.
- One dark stage surface, reserved for battle and arena Flex cards.
- Failure, empty and loading are three visibly different states.
- Destructive actions confirm with consequence text and land focus on cancel.

## Colors

A cool cyan-and-mist working palette warmed by a single caramel accent, with game-semantic colors (rarity, medal, currency) kept in their own named slots.

### Primary
- **Miyako Cyan** (`miyako-cyan`): the working color. Text links, contained primary buttons, selected nav items, focus outline, caret, info alerts. Passes 4.5:1 on paper and on mist.
- **Miyako Hair Cyan** (`miyako-cyan-light`): decoration only. Hairlines and dividers (at 12% alpha as `cyan-hairline`), selection highlight (25% alpha), scrollbar thumb, chart strokes, the hover border and glow on interactive cards. Never text, never under white text.
- **Deep Cyan** (`miyako-cyan-deep`): hover/pressed fill and the dark end of the PageHero gradient.

### Secondary
- **Pudding Caramel** (`pudding-caramel`): the warm voice. Sponsorship tone of PageHero, currency (女神石) ink, base-star marks, race and god-stone feature accents. Also the `warning` color. Text-safe on white.
- **Pudding Amber** (`pudding-amber`): decoration only (badges, fills behind dark ink, chart accents).
- **Caramel Deep** (`caramel-deep`): hover/pressed and gradient end for the caramel tone.

### Tertiary
- **Rarity ladder** (`rarity-common` / `rarity-rare` / `rarity-epic` / `rarity-legendary`, labels 普通 / 稀有 / 史詩 / 傳說): achievement and loot rarity in LIFF, each paired with a pale background in `theme.palette.rarity`. Flex cards currently carry a different ladder in `RARITY` (common grey, rare blue, epic purple, legendary orange); the two are not reconciled, and neither should be changed to match the other without a decision.
- **Medals** (`medal-gold` / `medal-silver` / `medal-bronze`): top-three ranks only, on leaderboards and race podiums.
- **Currency** (`pudding-caramel` on `currency-bg`): every display of 女神石.

### Neutral
- **Ink** (`ink`): primary text; also the AppBar text color.
- **Muted Ink** (`ink-muted`): secondary text, inactive nav labels.
- **Mist** (`mist`): page background and light `theme-color`; Flex `SURFACE.bgAlt`.
- **Paper** (`paper`): cards, drawers, dialogs, bottom nav, Flex bubble default.
- **Inset** (`surface-inset`): recessed wells inside cards (`theme.palette.surface.inset`).
- **Stage Night family** (`stage-night`, `stage-panel`, `stage-raised`, `stage-button`, `stage-text`, `stage-text-muted`, `stage-accent`): the Flex `HERO_SURFACE`, mirrored by the LIFF dark mode background (`stage-night` / `stage-panel`).

### Dark mode (LIFF)
Follows `prefers-color-scheme` with a saved override. Primary becomes `night-cyan`, secondary `night-amber`, both with dark contrast text; background is `stage-night`, paper `stage-panel`. Rarity, medal and currency have their own dark-tuned values in `darkTokens`.

### Named Rules
**The Main-Reads, Light-Decorates Rule.** `main` is the only shade allowed as text or under white text. `light` (`miyako-cyan-light`, `pudding-amber`) is for borders, charts and large decorative fills. If a color needs to be read, it is `main`.

**The Token-Only Rule.** No hex in components. LIFF pages read `theme.palette.*` (including `rarity`, `medal`, `currency`, `surface`); Flex templates import `SEMANTIC`, `SURFACE`, `HERO_SURFACE`, `FEATURE`, `RARITY`, `TINT`, `MEDAL`, `PRESTIGE`, `OVERLAY` from `app/src/templates/common/theme.js`. A new color goes into the token file first.

**The One Stage Rule.** Flex cards are light by default. `HERO_SURFACE` is reserved for scenes: world boss, janken, race. A status, list or settings card never goes dark to look exciting.

## Typography

**Body Font:** Roboto, with Noto Sans TC for Chinese (then Helvetica Neue, Arial, sans-serif). Loaded from Google Fonts at 400 / 500 / 700.
**Display Font:** none separate; hierarchy comes from weight and size within the same family.

**Character:** a plain, highly legible pairing where Noto Sans TC does most of the visible work; weight (600–700) carries hierarchy rather than a decorative face.

### Hierarchy
- **Headline** (700, 2.125rem): rare page-level headings (MUI h4).
- **Page title** (700, 1.5rem): PageHero title (h5).
- **Title** (600, 1.25rem): dialog titles, AccessDenied title (h6, set to 700 there).
- **Section title** (700, 1rem): SectionCard heading (subtitle1, rendered as h2, or h3 when nested).
- **Body** (400, 1rem) and **Body small** (400, 0.875rem): content; body small for card descriptions and hero subtitles.
- **Label** (0.75rem): the smallest allowed size. Bottom-nav labels (700 when selected), captions, tabular numbers.
- **Button** (600, 0.875rem, no uppercase): `textTransform: none` everywhere.

LINE Flex uses LINE's named sizes: `xs` (13px) is the workhorse, `sm` for secondary lines, `md`–`xl` for titles and numbers, `xxl`/`3xl` only for hero figures. `xxs` is not used.

### Named Rules
**The 12px Floor Rule.** No text below 12px (0.75rem) in LIFF, and nothing below Flex `xs` in cards.

**The Tabular Number Rule.** Counts, prices and star numbers use `font-variant-numeric: tabular-nums` so rows don't reflow as values change.

## Layout

Phone-first inside the LIFF webview. Main content pads 16px on phones and 24px from `md` up. Under `sm`, a fixed 56px bottom navigation (plus `env(safe-area-inset-bottom)`) holds the four most-used destinations, and the main area reserves that height plus 16px so the last block is never covered. From `md` up a permanent 260px drawer replaces the temporary one (which is `min(260px, 86vw)` on phones). The AppBar is fixed and frosted.

Spacing follows MUI's 8px unit. Cards pad 16px on phones and 20px from `sm`; inside a SectionCard, the title block and content stack 14px apart. Readable single-column pages cap around 640–760px. Section headers place an action on the right that wraps beneath the title on narrow screens.

**The Thumb-Zone Rule.** Frequent destinations live in the bottom nav on phones; everything else stays in the drawer. The bottom nav holds four items, all reachable without first choosing a group.

## Elevation & Depth

Flat with hairlines at rest. Cards are white paper with a 1px cyan hairline (`cyan-hairline`) and no shadow; the AppBar is translucent white (85%) with a 12px backdrop blur and the same hairline below. Depth appears only as a response to state.

### Shadow Vocabulary
- **Interactive lift** (`box-shadow: 0 4px 20px rgba(0, 172, 193, 0.1)`, border to `rgba(0, 172, 193, 0.3)`, 0.2s ease-out): hover on a card that contains a `CardActionArea` or is marked `data-interactive`. Dark mode uses `0 4px 20px rgba(0, 0, 0, 0.35)`.
- **Dark-mode button glow** (`box-shadow: 0 0 16px rgba(38, 198, 218, 0.35)`; amber `rgba(251, 191, 36, 0.35)` for secondary): hover on contained buttons in dark mode only.
- **Focus ring** (`outline: 2px solid` primary main, offset 2px): every `:focus-visible`.

### Named Rules
**The Only-Clickable-Lifts Rule.** A static information card never lifts on hover. A lift says "this is tappable"; giving it to static cards is a lie.

## Shapes

Gently rounded throughout. The base radius is 12px (cards, buttons, inputs, dialogs). Larger containers step up in multiples of it: 24px for inner panels, 36px for the PageHero and the AccessDenied panel. Status chips and counters are pills. Flex cards use LINE's `md`/`lg` corner radii for boxes and fully rounded pills for tags. Borders are 1px hairlines; there are no heavy outlines.

## Components

### Buttons
Confident, flat, sentence-case.
- **Shape:** base radius (12px), weight 600, no uppercase.
- **Primary:** Miyako cyan fill, white text; minimum height 44px wherever the button is a primary tap target.
- **Secondary:** pudding caramel fill, white text, used for sponsorship and currency actions.
- **Destructive:** error red fill with a verb label (「刪除」, not 「確認」).
- **Text:** cyan text, no fill; the default for cancel and back.
- **Hover / Focus:** deeper fill; 2px primary outline on focus-visible; dark mode adds a soft glow.

### Confirm Dialog (AlertDialog)
- Description states the consequence (who is affected, whether it can be undone), with line breaks preserved.
- `destructive`: confirm turns red and initial focus moves to 取消, so a stray Enter never executes.
- `busy`: both buttons lock, the confirm label becomes 「處理中…」, and backdrop / Esc cannot close.
- Action buttons are at least 44px high.

### Load Error
- An error Alert with a plain-language message (default 「資料載入失敗，請檢查網路後再試一次。」) and a 44px 重試 button.
- Render order is fixed: loading → skeleton, error → LoadError, empty → empty state, else content. No status codes or stacks shown to players.

### Cards / Containers (SectionCard)
- **Corner Style:** 12px.
- **Background:** paper, outlined with the cyan hairline.
- **Shadow Strategy:** none; lifts only if interactive (see Elevation).
- **Internal Padding:** 16px, 20px from `sm`.
- **Structure:** section title (h2/h3), optional description only when the layout needs it, optional right-hand action that wraps.

### Page Hero
- 135° gradient from the tone's `dark` to `main` (primary by default; secondary marks sponsorship), 36px radius, 20px/28px padding.
- All text, HeroChips and HeroButtons use the tone's contrast text; HeroButtons are translucent (20% → 30% on hover), shadowless, 44px high.

### Navigation
- **Bottom nav (phones):** white paper, top hairline, 56px plus safe area, four icon+label items; the selected item is cyan and bold so it reads without color.
- **Drawer:** 260px, hairline right border, grouped sections.
- **AppBar:** frosted translucent white, hairline bottom.

### Base Star
- One star icon plus a number (★3), never a repeated row of stars, so width is fixed from 1★ to 6★. Caramel, 700, tabular numbers, `aria-label="基礎 N 星"`. Renders nothing when the value is missing.

### Access Denied
- A centered 420px panel with a lock icon and title. Shows a 登入 button only when logged out; always offers 回到首頁. Replaces silent redirects.

### LINE Flex Cards
- **Light bubbles (default):** `SURFACE.bg` paper with `SURFACE.text` ink; the header accent comes from `FEATURE.<feature>.main`; soft status chips come from `TINT.<hue>` (pale bg, matching border, dark ink).
- **Stage bubbles:** `HERO_SURFACE` night background, raised panels, `bgButton` buttons, amber `textAccent` for the key figure. Only world boss, janken and race.
- **Image-backed bubbles:** text on photos goes through `OVERLAY` scrims and on-color whites.
- **Group context:** status cards that show the player's own state in groups (#我的狀態, daily gacha balance, XP history, janken rank rewards, achievements, prestige) are an intentional exception, recorded in `.impeccable/critique/ignore.md`. Every new group message still classifies each field as public or personal before design, per CLAUDE.md, and does not mix both by default.

## Do's and Don'ts

### Do:
- **Do** use `main` shades (`miyako-cyan`, `pudding-caramel`) for any text or white-text fill, and keep `light` shades decorative.
- **Do** take every color from `theme.palette.*` or `app/src/templates/common/theme.js`; add new colors to the token file first.
- **Do** keep touch targets at least 44px high and text at least 12px (Flex: at least `xs`).
- **Do** render failure with LoadError and a retry, distinct from the empty state.
- **Do** confirm destructive actions with AlertDialog `destructive`, a verb label and consequence text, with focus on 取消.
- **Do** let layout carry meaning: a title, a number and its state, with descriptions only where the layout cannot explain itself.
- **Do** address the player as 你 in zh-TW copy.
- **Do** keep Flex bubbles light unless the card is a battle or arena scene.

### Don't:
- **Don't** put white text on `miyako-cyan-light` (#00ACC1) or `pudding-amber` (#F59E0B); they fail 4.5:1.
- **Don't** hard-code hex values in pages or templates.
- **Don't** catch an error and show an empty list, 「尚無資料」, zeros or a default toggle state.
- **Don't** give hover lift to static cards.
- **Don't** add secondary labels, overline captions or explanatory sublines that repeat what the layout already shows.
- **Don't** use `HERO_SURFACE` for non-scene cards.
- **Don't** ship one-tap destructive actions.
