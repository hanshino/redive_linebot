import { Box } from "@mui/material";
import { tierLabelFromFactor } from "./diminishTier";

const trim = n => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  return Number(num.toFixed(2)).toString();
};
const mult = n => `×${trim(n)}`;

function Row({ label, value, accent, total, dim }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 1,
        py: total ? 0.25 : 0,
      }}
    >
      <Box
        component="span"
        sx={{
          color: dim ? "text.disabled" : total ? "text.primary" : "text.secondary",
          fontWeight: total ? 700 : 500,
          fontSize: total ? 13 : 12,
        }}
      >
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          fontFamily: "ui-monospace, Menlo, monospace",
          fontWeight: total ? 700 : 600,
          fontSize: total ? 14 : 12,
          color: accent || (total ? "text.primary" : "text.primary"),
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

function Divider() {
  return <Box sx={{ height: "1px", bgcolor: "divider", my: 0.5 }} />;
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
        }}
      >
        此筆早於 v2，無乘數明細
      </Box>
    );
  }

  const rawSteps = [
    { label: "冷卻", val: mult(ev.cooldown_rate), hide: ev.cooldown_rate === 1 },
    { label: "群組加成", val: mult(ev.group_bonus), hide: ev.group_bonus === 1 },
    { label: "暖流祝福", val: mult(ev.blessing1_mult), hide: ev.blessing1_mult === 1 },
  ];
  const tierLabel = tierLabelFromFactor(ev.diminish_factor);
  const effSteps = [
    { label: "蜜月加成", val: mult(ev.honeymoon_mult), hide: ev.honeymoon_mult === 1 },
    {
      label: tierLabel,
      val: mult(ev.diminish_factor),
      hide: ev.diminish_factor === 1,
      accent: ev.diminish_factor <= 0.05 ? "error.dark" : undefined,
    },
    { label: "試煉倍率", val: mult(ev.trial_mult), hide: ev.trial_mult === 1 },
    { label: "永久加成", val: mult(ev.permanent_mult), hide: ev.permanent_mult === 1 },
  ];

  const visibleRaw = rawSteps.filter(s => showAll || !s.hide);
  const visibleEff = effSteps.filter(s => showAll || !s.hide);
  const effDimmed = ev.effective_exp === 0 || ev.effective_exp < ev.raw_exp / 2;

  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: "#F8FAFB",
        borderRadius: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.25,
      }}
    >
      <Row label="基礎 XP" value={trim(ev.base_xp)} />
      {visibleRaw.map((s, i) => (
        <Row key={`r${i}`} label={s.label} value={s.val} dim />
      ))}
      <Divider />
      <Row label="原始 XP" value={ev.raw_exp} total />
      {visibleEff.length > 0 && (
        <>
          {visibleEff.map((s, i) => (
            <Row key={`e${i}`} label={s.label} value={s.val} accent={s.accent} dim />
          ))}
          <Divider />
        </>
      )}
      <Row
        label="實得 XP"
        value={ev.effective_exp}
        total
        accent={effDimmed ? "warning.dark" : "success.dark"}
      />
    </Box>
  );
}
