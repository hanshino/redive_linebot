import { alpha } from "@mui/material/styles";

// 列表與表單共用同一份星等設定，避免兩邊寫法不一致。
// 顏色借用 theme.palette.rarity 的深淺模式配色（SSR 金、SR 紫、R 灰），
// 只取 main / bg，不取 label（那是成就稀有度的名稱）。
export const STAR_META = {
  3: { short: "SSR", full: "SSR（三星）", rarity: 2 },
  2: { short: "SR", full: "SR（二星）", rarity: 1 },
  1: { short: "R", full: "R（一星）", rarity: 0 },
};

export const STAR_OPTIONS = [3, 2, 1].map(value => ({ value, label: STAR_META[value].full }));

/** 取某星等在目前主題下的 { color, bg, border }。 */
export function starColors(theme, star) {
  const meta = STAR_META[star] || STAR_META[1];
  const token = theme.palette.rarity[meta.rarity];
  return { color: token.main, bg: token.bg, border: alpha(token.main, 0.35) };
}

/** 機率最多顯示 3 位小數，去掉尾端的 0。 */
export const fmtRate = n => `${Number((Number(n) || 0).toFixed(3))}%`;
