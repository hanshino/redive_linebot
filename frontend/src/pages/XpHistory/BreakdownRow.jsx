import { Box, Typography } from "@mui/material";

const fmt = (n, d = 2) => (Number(n) || 0).toFixed(d);

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

  const rawParts = [
    { label: "base", val: fmt(ev.base_xp, 3), hide: false, color: "text.primary" },
    { label: "cooldown", val: `×${fmt(ev.cooldown_rate)}`, hide: ev.cooldown_rate === 1 },
    { label: "群組", val: `×${fmt(ev.group_bonus)}`, hide: ev.group_bonus === 1 },
    { label: "暖流", val: `×${fmt(ev.blessing1_mult)}`, hide: ev.blessing1_mult === 1 },
  ];
  const tierLabel =
    ev.diminish_factor === 1
      ? "遞減 tier1"
      : ev.diminish_factor === 0.3
        ? "遞減 tier2"
        : "遞減 tier3";
  const effParts = [
    { label: "蜜月", val: `×${fmt(ev.honeymoon_mult)}`, hide: ev.honeymoon_mult === 1 },
    { label: tierLabel, val: `×${fmt(ev.diminish_factor)}`, hide: ev.diminish_factor === 1 },
    { label: "試煉", val: `×${fmt(ev.trial_mult)}`, hide: ev.trial_mult === 1 },
    { label: "永久", val: `×${fmt(ev.permanent_mult)}`, hide: ev.permanent_mult === 1 },
  ];

  const visibleRaw = rawParts.filter(p => showAll || !p.hide);
  const visibleEff = effParts.filter(p => showAll || !p.hide);

  return (
    <Box
      sx={{
        p: 1.5,
        bgcolor: "#F8FAFB",
        borderRadius: 1,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "baseline" }}>
        {visibleRaw.map((p, i) => (
          <Box key={i} component="span" sx={{ fontWeight: i === 0 ? 700 : 600 }}>
            <Box component="span" sx={{ color: "text.disabled", fontWeight: 400, mr: 0.5 }}>
              {p.label}
            </Box>
            {p.val}
          </Box>
        ))}
      </Box>
      <Typography
        component="div"
        sx={{ ml: 2, fontFamily: "inherit", fontSize: 12, color: "text.secondary" }}
      >
        → raw{" "}
        <Box component="span" sx={{ color: "text.primary", fontWeight: 700, fontSize: 13 }}>
          {ev.raw_exp}
        </Box>
      </Typography>

      {visibleEff.length > 0 && (
        <Box
          sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "baseline" }}
        >
          <Box component="span" sx={{ color: "text.disabled", fontWeight: 400 }}>
            raw {ev.raw_exp}
          </Box>
          {visibleEff.map((p, i) => (
            <Box key={i} component="span" sx={{ fontWeight: 600 }}>
              <Box component="span" sx={{ color: "text.disabled", fontWeight: 400, mr: 0.5 }}>
                {p.label}
              </Box>
              {p.val}
            </Box>
          ))}
        </Box>
      )}
      <Typography
        component="div"
        sx={{ ml: 2, fontFamily: "inherit", fontSize: 12, color: "text.secondary" }}
      >
        → effective{" "}
        <Box component="span" sx={{ color: "warning.dark", fontWeight: 700, fontSize: 14 }}>
          {ev.effective_exp}
        </Box>
      </Typography>
    </Box>
  );
}
