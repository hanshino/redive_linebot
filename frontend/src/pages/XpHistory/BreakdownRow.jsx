import { Box, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { TIER2_RATE, tierLabelFromFactor } from "./diminishTier";
import { mult, trim } from "./format";
import { getXpTokens } from "./xpTokens";

// Under 鍊金之霧 the event keeps its full effective_exp, but it is paid out as
// 女神石 instead of level progress — so the chain must not end at 「實得 XP」.
// A protected event has no effects at all and falls through to the normal path.
function alchemyRate(ev) {
  if (ev.weather_protected) return null;
  return Number(ev.modifiers?.weather?.effects?.exp_to_stone_rate) || null;
}

function colorForDiminish(c, factor) {
  if (factor === 1) return c.textMuted;
  if (factor === TIER2_RATE) return c.caution;
  return c.negative;
}

function colorForTrial(c, m) {
  if (m < 1) return c.caution;
  if (m > 1) return c.positive;
  return c.textMuted;
}

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
      <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
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
      sx={{
        flexWrap: "wrap",
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

function shapeRawParts(ev, c) {
  return [
    { label: "基礎", val: trim(ev.base_xp), color: c.textStrong, weight: 700, hide: false },
    {
      label: "冷卻",
      val: mult(ev.cooldown_rate),
      color: ev.cooldown_rate > 1 ? c.effectiveText : c.textMuted,
      hide: ev.cooldown_rate === 1,
    },
    {
      label: "群組",
      val: mult(ev.group_bonus),
      color: ev.group_bonus > 1 ? c.bonus : c.textMuted,
      hide: ev.group_bonus === 1,
    },
    {
      label: "暖流祝福",
      val: mult(ev.blessing1_mult),
      color: ev.blessing1_mult > 1 ? c.bonus : c.textMuted,
      hide: ev.blessing1_mult === 1,
    },
  ];
}

function shapeEffParts(ev, c) {
  return [
    {
      label: "蜜月",
      val: mult(ev.honeymoon_mult),
      color: ev.honeymoon_mult > 1 ? c.positive : c.textMuted,
      hide: ev.honeymoon_mult === 1,
    },
    {
      label: tierLabelFromFactor(ev.diminish_factor),
      val: mult(ev.diminish_factor),
      color: colorForDiminish(c, ev.diminish_factor),
      hide: ev.diminish_factor === 1,
    },
    {
      label: "試煉",
      val: mult(ev.trial_mult),
      color: colorForTrial(c, ev.trial_mult),
      hide: ev.trial_mult === 1,
    },
    {
      label: "永久",
      val: mult(ev.permanent_mult),
      color: ev.permanent_mult > 1 ? c.violet : c.textMuted,
      hide: ev.permanent_mult === 1,
    },
  ];
}

function ChainArrow({ to, value, color = "text.primary", valueSize = 13 }) {
  return (
    <Box
      sx={{
        mt: 0.5,
        ml: 1.75,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        color: "text.secondary",
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
  const c = getXpTokens(useTheme());
  if (ev.base_xp == null) {
    return (
      <Box
        sx={{
          p: 1.5,
          bgcolor: "surface.subtle",
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

  const rawParts = shapeRawParts(ev, c);
  const effParts = shapeEffParts(ev, c);
  const visibleRaw = rawParts.filter(p => showAll || !p.hide);
  const visibleEff = effParts.filter(p => showAll || !p.hide);
  const rate = alchemyRate(ev);

  return (
    <Box sx={{ p: 1.5, bgcolor: "surface.subtle", borderRadius: 1 }}>
      <ChainRow>
        {visibleRaw.map((p, i) => (
          <ChainPart key={i} {...p} />
        ))}
      </ChainRow>
      <ChainArrow to="原始 XP" value={ev.raw_exp} />

      {visibleEff.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <ChainRow>
            <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
              原始 {ev.raw_exp}
            </Box>
            {visibleEff.map((p, i) => (
              <ChainPart key={i} {...p} />
            ))}
          </ChainRow>
        </Box>
      )}
      {rate ? (
        <>
          <ChainArrow to="鍊成 XP" value={ev.effective_exp} color={c.violet} valueSize={14} />
          <Box
            sx={{
              mt: 0.5,
              ml: 1.75,
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12,
              color: c.violet,
            }}
          >
            🌫 鍊金之霧 · {rate === 1 ? "1:1 鍊成女神石" : `每 ${rate} XP 鍊成 💎1`}，當日不累積等級
          </Box>
        </>
      ) : (
        <ChainArrow to="實得 XP" value={ev.effective_exp} color={c.effectiveText} valueSize={14} />
      )}
    </Box>
  );
}
