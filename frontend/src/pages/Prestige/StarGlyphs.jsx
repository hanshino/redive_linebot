import { Typography } from "@mui/material";

/**
 * ★★★☆☆ 字形評等。螢幕閱讀器會把每顆星唸出來，所以整串包成 role="img"，
 * 只念「3 / 5 星」。
 */
export default function StarGlyphs({ value, max = 5, ...typographyProps }) {
  const filled = Math.max(0, Math.min(value ?? 0, max));
  return (
    <Typography
      component="span"
      role="img"
      aria-label={`${filled} / ${max} 星`}
      {...typographyProps}
    >
      {"★".repeat(filled) + "☆".repeat(max - filled)}
    </Typography>
  );
}
