/**
 * Unified color tokens for LINE Flex Message templates.
 *
 * Aligned with the frontend "Miyako (宮子)" theme (frontend/src/theme/index.js)
 * so LINE flex messages and the LIFF pages share one brand identity:
 *   - Primary: cyan (#007C89 as text/fill, #00ACC1 as decoration) — Miyako's hair
 *   - Secondary: caramel (#B45309 as text/fill, #F59E0B as decoration) — pudding
 *
 * Import the named exports (SEMANTIC / RARITY / SURFACE / HERO_SURFACE /
 * FEATURE) instead of hard-coding hex values inside individual templates:
 *
 *   const { SURFACE, FEATURE, RARITY } = require("../common/theme");
 *   backgroundColor: FEATURE.gacha.main
 *   color: RARITY.legendary.main
 *
 * Guideline:
 * - Use SEMANTIC for status (success / warning / danger / info / neutral).
 * - Use FEATURE.<name>.main as the accent color of a feature's hero/header.
 * - Use SURFACE for light-background bubbles (achievements, info, market).
 * - Use HERO_SURFACE for dark "stage" bubbles (janken duel, race, battle).
 * - Use RARITY for loot / achievements / gacha results.
 */

const PALETTE = {
  // neutrals (text/divider palette; aligned with frontend light theme)
  gray50: "#F5F7FA",
  gray100: "#E0E0E0",
  gray300: "#BDBDBD",
  gray500: "#8DA4BE",
  gray700: "#5A6B7F",
  gray900: "#1A2332",
  white: "#FFFFFF",
  black: "#000000",

  // primary — Miyako cyan
  cyan400: "#4DD0E1",
  cyan500: "#26C6DA",
  cyan600: "#00ACC1",
  cyan700: "#00838F",
  cyan800: "#007C89",
  cyan900: "#00606B",

  // secondary — pudding amber
  amber300: "#FCD34D",
  amber400: "#FBBF24",
  amber500: "#F59E0B",
  amber600: "#D97706",
  caramel600: "#B45309",
  caramel700: "#92400E",

  // status
  green400: "#4ADE80",
  green500: "#22C55E",
  green600: "#16A34A",
  green700: "#15803D",
  green800: "#166534",
  red400: "#F87171",
  red500: "#EF4444",
  red600: "#DC2626",
  red700: "#B91C1C",
  rose400: "#FB7185",
  rose800: "#9F1239",

  // rarity (game-standard ordering)
  rarityCommon: "#9E9E9E",
  rarityRare: "#3478FF",
  rarityEpic: "#A834FF",
  rarityLegendary: "#FF8C00",

  // dark "hero" stage (aligned with frontend darkTheme bg)
  hero900: "#0A1A2A",
  hero800: "#12243A",
  hero700: "#1A2E4A",
  hero600: "#2D4068",
  heroText: "#E8EEF4",
  heroTextMuted: "#B0BEC5",
};

const SEMANTIC = {
  // main = readable as text and under white button text (4.5:1); light = decoration only
  primary: {
    main: PALETTE.cyan800,
    light: PALETTE.cyan600,
    dark: PALETTE.cyan900,
    contrast: PALETTE.white,
  },
  secondary: {
    main: PALETTE.caramel600,
    light: PALETTE.amber500,
    dark: PALETTE.caramel700,
    contrast: PALETTE.white,
  },
  success: {
    main: PALETTE.green700,
    light: PALETTE.green500,
    dark: PALETTE.green800,
    contrast: PALETTE.white,
  },
  warning: {
    main: PALETTE.caramel600,
    light: PALETTE.amber500,
    dark: PALETTE.caramel700,
    contrast: PALETTE.white,
  },
  danger: {
    main: PALETTE.red600,
    light: PALETTE.red500,
    dark: PALETTE.red700,
    contrast: PALETTE.white,
  },
  info: {
    main: PALETTE.cyan800,
    light: PALETTE.cyan600,
    dark: PALETTE.cyan900,
    contrast: PALETTE.white,
  },
  neutral: {
    main: PALETTE.gray700,
    light: PALETTE.gray500,
    dark: PALETTE.gray900,
    contrast: PALETTE.white,
  },
};

const RARITY = {
  common: { main: PALETTE.rarityCommon, bg: "#F5F5F5", text: PALETTE.gray700 },
  rare: { main: PALETTE.rarityRare, bg: "#E3F2FD", text: "#0D47A1" },
  epic: { main: PALETTE.rarityEpic, bg: "#F3E5F5", text: "#4A148C" },
  legendary: { main: PALETTE.rarityLegendary, bg: "#FFF3E0", text: "#E65100" },
};

const SURFACE = {
  bg: PALETTE.white,
  bgAlt: PALETTE.gray50,
  bgMuted: PALETTE.gray100,
  bgInverse: PALETTE.hero900,

  divider: PALETTE.gray300,
  dividerMuted: PALETTE.gray100,

  text: PALETTE.gray900,
  textMuted: PALETTE.gray700,
  textDisabled: PALETTE.gray500,
  textInverse: PALETTE.white,
};

/**
 * Dark "stage" surface for feature bubbles that read as a game scene
 * (janken duel, horse race, guild battle). Matches the frontend darkTheme
 * so LIFF pages feel continuous with the flex messages that launched them.
 */
const HERO_SURFACE = {
  bg: PALETTE.hero900,
  bgAlt: PALETTE.hero800,
  bgRaised: PALETTE.hero700,
  bgButton: PALETTE.hero600,

  divider: PALETTE.hero600,

  text: PALETTE.heroText,
  textMuted: PALETTE.heroTextMuted,
  textAccent: PALETTE.amber400,
};

/**
 * Medal ordering (rank 1 / 2 / 3) for leaderboards and race podiums.
 */
const MEDAL = {
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
};

/**
 * Soft "tint" chips: a pale background with a matching border and a dark ink
 * for text on top of it. `main` is the saturated accent used for stars / icons.
 * Replaces the per-template forks (Me/_shared, XpHistory, Prestige, Market).
 */
const TINT = {
  cyan: {
    main: PALETTE.cyan600,
    bg: "#E0F7FA",
    border: "#B2EBF2",
    ink: "#002A30",
    desc: "#00606B",
  },
  amber: {
    main: "#B8772A",
    bg: "#FBF1E8",
    border: "#EBCDA8",
    ink: "#7A4A12",
    desc: "#74604A",
    deep: "#3A2800",
  },
  green: { main: "#3F8C50", bg: "#ECF6EE", border: "#C2DFC8", ink: "#1F4A2C", desc: "#5C6E60" },
  red: { main: "#DC2626", bg: "#FDECEC", border: "#F5C2C2", ink: "#B91C1C", desc: "#7F1D1D" },
  blue: { main: "#3D6FB8", bg: "#EEF3FB", border: "#C7D8EE", ink: "#1F3F6E", desc: "#5E6470" },
  purple: { main: "#7A4FB5", bg: "#F1ECF7", border: "#D6C9E8", ink: "#3F2470", desc: "#665A78" },
  slate: { main: "#8E8E93", bg: "#F6F6F8", border: "#E2E2E6", ink: "#3B3B40", desc: "#6B6B70" },
  mint: {
    main: PALETTE.green500,
    bg: "#E8F9EF",
    border: "#BBF7D0",
    ink: "#15803D",
    desc: "#166534",
  },
  gold: {
    main: PALETTE.amber400,
    bg: "#FFF7E6",
    border: PALETTE.amber400,
    ink: "#B45309",
    desc: "#92400E",
  },
  violet: { main: "#C4B5FD", bg: "#EDE9FE", border: "#D8B4FE", ink: "#5B21B6", desc: "#E9D5FF" },
  grey: { main: "#9CA3AF", bg: "#EEF0F3", border: "#E0E0E0", ink: "#6B6577", desc: "#6B6577" },
  periwinkle: {
    main: "#5C7CCB",
    bg: "#EEF1FB",
    border: "#CDD7EE",
    ink: "#1F3F6E",
    desc: "#5E6470",
  },
  ochre: { main: "#A07A2C", bg: "#F8F0E0", border: "#E8D5A8", ink: "#3A2800", desc: "#74604A" },
};

/**
 * Prestige (轉生) accent: the purple hero + gold star used by every prestige card.
 */
const PRESTIGE = {
  purple: "#3B2A6B",
  deep: "#2A1F4D",
  gold: "#F5C84B",
  lilac: "#E5DFFF",
  lilacSoft: "#EEEAF7",
  successInk: "#2F6B3F",
  successBg: "#E8F6EC",
  successBorder: "#B8DEC2",
};

/**
 * Text/overlay helpers shared by image-backed bubbles (gacha, group, market).
 * `onColor*` sit on saturated fills; `scrim*` darken photos for legibility.
 */
const OVERLAY = {
  onColor: PALETTE.white,
  onColorMuted: "#FFFFFFCC",
  onColorSoft: "#FFFFFF44",
  onColorFaint: "#FFFFFF66",
  scrimCyan: "#00838FCC",
  scrimNeutral: "#1A2332CC",
};

/**
 * Each feature picks a SEMANTIC color as its accent. Keep the mapping small:
 * if a feature doesn't fit anywhere obvious, default to primary.
 *
 * Features with dark hero bubbles (janken / race / guildBattle) still expose
 * an accent here so shared controls rendered inside them pick a color from
 * the same palette.
 */
const FEATURE = {
  gacha: SEMANTIC.primary,
  achievement: SEMANTIC.primary,
  janken: SEMANTIC.primary,
  race: SEMANTIC.secondary,
  guildBattle: SEMANTIC.danger,
  worldBoss: SEMANTIC.danger,
  subscribe: SEMANTIC.info,
  customerOrder: SEMANTIC.neutral,
  market: SEMANTIC.success,
  chatLevel: SEMANTIC.info,
  dailyQuest: SEMANTIC.success,
  announce: SEMANTIC.neutral,
  godStone: SEMANTIC.secondary,
};

module.exports = {
  PALETTE,
  SEMANTIC,
  RARITY,
  SURFACE,
  HERO_SURFACE,
  FEATURE,
  MEDAL,
  TINT,
  PRESTIGE,
  OVERLAY,
};
