import { Box, Stack, Typography } from "@mui/material";
import { tierLabelFromFactor } from "./diminishTier";

const COLOR = {
  deep: "#3A2800",
  muted: "#5A6B7F",
  mutedSoft: "#94A3B8",
  cyan: "#00838F",
  amberDeep: "#F59E0B",
  amberText: "#B45309",
  redDeep: "#B91C1C",
  greenDeep: "#15803D",
  purple: "#6B21A8",
};

const trim = n => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  return Number(num.toFixed(2)).toString();
};

const mult = n => `×${trim(n)}`;

function ChainPart({ label, value, color, weight = 600 }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      <Box component="span" sx={{ color: COLOR.mutedSoft, fontWeight: 400 }}>
        {label}
      </Box>
      <Box component="span" sx={{ color, fontWeight: weight }}>
        {value}
      </Box>
    </Box>
  );
}

function ChainRow({ children }) {
  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      sx={{
        rowGap: "4px",
        columnGap: "8px",
        alignItems: "baseline",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      {children}
    </Stack>
  );
}

function shapeRawParts(ev) {
  return [
    { label: "基礎", val: trim(ev.base_xp), color: COLOR.deep, weight: 700, hide: false },
    {
      label: "冷卻",
      val: mult(ev.cooldown_rate),
      color: ev.cooldown_rate > 1 ? COLOR.amberDeep : COLOR.muted,
      hide: ev.cooldown_rate === 1,
    },
    {
      label: "群組",
      val: mult(ev.group_bonus),
      color: ev.group_bonus > 1 ? COLOR.cyan : COLOR.muted,
      hide: ev.group_bonus === 1,
    },
    {
      label: "暖流祝福",
      val: mult(ev.blessing1_mult),
      color: ev.blessing1_mult > 1 ? COLOR.cyan : COLOR.muted,
      hide: ev.blessing1_mult === 1,
    },
  ];
}

function shapeEffParts(ev) {
  return [
    {
      label: "蜜月",
      val: mult(ev.honeymoon_mult),
      color: ev.honeymoon_mult > 1 ? COLOR.greenDeep : COLOR.muted,
      hide: ev.honeymoon_mult === 1,
    },
    {
      label: tierLabelFromFactor(ev.diminish_factor),
      val: mult(ev.diminish_factor),
      color:
        ev.diminish_factor === 1
          ? COLOR.muted
          : ev.diminish_factor === 0.3
            ? COLOR.amberText
            : COLOR.redDeep,
      hide: ev.diminish_factor === 1,
    },
    {
      label: "試煉",
      val: mult(ev.trial_mult),
      color:
        ev.trial_mult < 1 ? COLOR.amberText : ev.trial_mult > 1 ? COLOR.greenDeep : COLOR.muted,
      hide: ev.trial_mult === 1,
    },
    {
      label: "永久",
      val: mult(ev.permanent_mult),
      color: ev.permanent_mult > 1 ? COLOR.purple : COLOR.muted,
      hide: ev.permanent_mult === 1,
    },
  ];
}

function ChainArrow({ to, value, color = COLOR.deep, valueSize = 13 }) {
  return (
    <Box
      sx={{
        mt: 0.5,
        ml: 1.75,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        color: COLOR.muted,
      }}
    >
      → {to}{" "}
      <Box component="span" sx={{ color, fontWeight: 700, fontSize: valueSize }}>
        {value}
      </Box>
    </Box>
  );
}

export default function BreakdownRow({ ev, showAll }) {
  if (ev.base_xp == null) {
    return (
      <Box
        sx={{
          p: 1.5,
          bgcolor: "#F8FAFB",
          borderRadius: 1,
          fontStyle: "italic",
          color: "text.secondary",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        此筆早於 v2，無乘數明細
      </Box>
    );
  }

  const rawParts = shapeRawParts(ev);
  const effParts = shapeEffParts(ev);
  const visibleRaw = rawParts.filter(p => showAll || !p.hide);
  const visibleEff = effParts.filter(p => showAll || !p.hide);

  return (
    <Box sx={{ p: 1.5, bgcolor: "#F8FAFB", borderRadius: 1 }}>
      <ChainRow>
        {visibleRaw.map((p, i) => (
          <ChainPart key={i} {...p} />
        ))}
      </ChainRow>
      <ChainArrow to="原始 XP" value={ev.raw_exp} />

      {visibleEff.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <ChainRow>
            <Box component="span" sx={{ color: COLOR.mutedSoft, fontWeight: 400 }}>
              原始 {ev.raw_exp}
            </Box>
            {visibleEff.map((p, i) => (
              <ChainPart key={i} {...p} />
            ))}
          </ChainRow>
        </Box>
      )}
      <ChainArrow to="實得 XP" value={ev.effective_exp} color={COLOR.amberDeep} valueSize={14} />
    </Box>
  );
}
