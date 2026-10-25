import { alpha, lighten } from "@mui/material/styles";

/**
 * XpHistory 的語意色，全部從 theme.palette 推出來，深淺模式各自對比過。
 * 不要在這個資料夾再寫死 hex。
 *
 *   effective   實得 XP（琥珀；bar 用 light 裝飾色，文字用 main 才有對比）
 *   bonus       加成倍率（宮子青）
 *   positive    蜜月、增益
 *   caution     第二階遞減、試煉扣除、減益天氣
 *   negative    第三階遞減
 *   violet      永久加成、鍊金之霧（theme 目前沒有專屬 alchemy 色，借稀有度的紫）
 */
export function getXpTokens(theme) {
  const p = theme.palette;
  return {
    textStrong: p.text.primary,
    textMuted: p.text.secondary,
    effectiveBar: p.secondary.light,
    effectiveText: p.secondary.main,
    bonus: p.primary.main,
    positive: p.success.main,
    caution: p.warning.main,
    negative: p.error.main,
    violet: p.rarity[1].main,
    weatherDebuff: p.warning.main,
    weatherBuff: p.success.main,
    weatherProtect: p.info.main,
    grid: p.divider,
    lossFill: p.text.secondary,
  };
}

// 小標籤（chip）：底色 = 前景色降透明度，前景直接用語意色。
export function chipColors(theme, color) {
  return { bg: alpha(color, theme.palette.mode === "dark" ? 0.18 : 0.12), fg: color };
}

/**
 * 「今日經驗」青色卡片的配色。
 * 淺色：深青底（primary.dark → main）+ 白字，點綴色用提亮的琥珀。
 * 深色：白字配亮青對比不足，改成青色淡染 + 一般文字色，點綴色用 secondary.main。
 */
export function getHeroTokens(theme) {
  const p = theme.palette;
  const dark = p.mode === "dark";
  const fg = dark ? p.text.primary : p.primary.contrastText;
  return {
    dark,
    fg,
    background: dark
      ? alpha(p.primary.main, 0.14)
      : `linear-gradient(135deg, ${p.primary.dark}, ${p.primary.main})`,
    border: dark ? `1px solid ${alpha(p.primary.main, 0.3)}` : "none",
    accent: dark ? p.secondary.main : lighten(p.secondary.light, 0.6),
    // 進度條三段 + 警示
    bar1: dark ? p.secondary.main : lighten(p.secondary.light, 0.4),
    bar2: dark ? p.secondary.dark : p.secondary.light,
    bar3: p.grey[dark ? 600 : 400],
    barRest: alpha(fg, 0.27),
    danger: dark ? p.error.main : lighten(p.error.main, 0.65),
    violetLight: dark ? p.rarity[1].main : lighten(p.rarity[1].main, 0.75),
    violetMid: dark ? alpha(p.rarity[1].main, 0.7) : lighten(p.rarity[1].main, 0.55),
  };
}
