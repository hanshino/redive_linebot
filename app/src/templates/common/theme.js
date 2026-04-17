/**
 * Unified color tokens for LINE Flex Message templates.
 *
 * Aligned with the frontend "Miyako (宮子)" theme (frontend/src/theme/index.js)
 * so LINE flex messages and the LIFF pages share one brand identity:
 *   - Primary: cyan (#00ACC1) — Miyako's hair
 *   - Secondary: amber (#F59E0B) — pudding
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

  // secondary — pudding amber
  amber300: "#FCD34D",
  amber400: "#FBBF24",
  amber500: "#F59E0B",
  amber600: "#D97706",

  // status
  green400: "#4ADE80",
  green500: "#22C55E",
  green600: "#16A34A",
  red400: "#F87171",
  red500: "#EF4444",
  red600: "#DC2626",

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
  primary: {
    main: PALETTE.cyan600,
    light: PALETTE.cyan500,
    dark: PALETTE.cyan700,
    contrast: PALETTE.white,
  },
  secondary: {
    main: PALETTE.amber500,
    light: PALETTE.amber400,
    dark: PALETTE.amber600,
    contrast: PALETTE.white,
  },
  success: {
    main: PALETTE.green500,
    light: PALETTE.green400,
    dark: PALETTE.green600,
    contrast: PALETTE.white,
  },
  warning: {
    main: PALETTE.amber500,
    light: PALETTE.amber400,
    dark: PALETTE.amber600,
    contrast: PALETTE.white,
  },
  danger: {
    main: PALETTE.red500,
    light: PALETTE.red400,
    dark: PALETTE.red600,
    contrast: PALETTE.white,
  },
  info: {
    main: PALETTE.cyan600,
    light: PALETTE.cyan500,
    dark: PALETTE.cyan700,
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

module.exports = { PALETTE, SEMANTIC, RARITY, SURFACE, HERO_SURFACE, FEATURE };
