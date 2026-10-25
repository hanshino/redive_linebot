import { Box, Stack } from "@mui/material";

import { chipColors, getXpTokens } from "./xpTokens";

// kind → 前景色（取自 xpTokens）；底色由 chipColors 依深淺模式降透明度。
const KIND_COLOR = {
  honeymoon: "positive",
  trial: "caution",
  blessing: "bonus",
  group: "bonus",
  dim2: "caution",
  dim3: "negative",
  perm: "violet",
  weatherDebuff: "weatherDebuff",
  weatherBuff: "weatherBuff",
  weatherProtect: "weatherProtect",
};

export function EventChip({ kind, label, value }) {
  return (
    <Box
      component="span"
      sx={theme => {
        const colorKey = KIND_COLOR[kind] || KIND_COLOR.group;
        const fg = getXpTokens(theme)[colorKey];
        const { bg } = chipColors(theme, fg);
        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: "2px",
          borderRadius: 999,
          bgcolor: bg,
          color: fg,
          // 第三階遞減加一圈邊，跟第二階（同樣是橘色系）不靠顏色也分得出來
          border: kind === "dim3" ? `1px solid ${fg}` : "none",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
        };
      }}
    >
      <span>{label}</span>
      {value && (
        <Box
          component="span"
          sx={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          {value}
        </Box>
      )}
    </Box>
  );
}

export function EventChipRow({ chips }) {
  if (!chips?.length) return null;
  return (
    <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
      {chips.map((c, i) => (
        <EventChip key={i} {...c} />
      ))}
    </Stack>
  );
}
