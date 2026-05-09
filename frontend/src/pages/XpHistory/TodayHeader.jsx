import { Box, Stack, Typography } from "@mui/material";

const COLOR = {
  cyan: "#00838F",
  cyan2: "#00ACC1",
  amber: "#FBBF24",
  amberDeep: "#F59E0B",
  amberText: "#FCD34D",
  redSoft: "#FCA5A5",
};

const DATE_FMT_TPE = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function formatDateBadge(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  // e.g. "05/01 五"
  return DATE_FMT_TPE.format(d).replace("週", "");
}

export default function TodayHeader({ summary }) {
  if (!summary) return null;
  const { date, raw_exp, effective_exp, msg_count, tier1_upper, tier2_upper } = summary;
  const cap = raw_exp || 0;
  const t1Used = Math.min(cap, tier1_upper);
  const t2Used = Math.min(Math.max(0, cap - tier1_upper), tier2_upper - tier1_upper);
  const t3Used = Math.max(0, cap - tier2_upper);
  const total = Math.max(cap, tier2_upper * 1.4);
  const w1 = (t1Used / total) * 100;
  const w2 = (t2Used / total) * 100;
  const w3 = (t3Used / total) * 100;
  const wRest = Math.max(0, 100 - w1 - w2 - w3);

  const tierLabel = t3Used > 0 ? "⚠ 第三階 ×0.03" : t2Used > 0 ? "第二階 ×0.30" : "滿速 第一階";
  const tierColor = t3Used > 0 ? COLOR.redSoft : COLOR.amberText;

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${COLOR.cyan}, ${COLOR.cyan2})`,
        borderRadius: 1.75,
        p: "18px 18px 16px",
        color: "#fff",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>今日經驗</Typography>
        <Typography
          sx={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11,
            color: COLOR.amberText,
            fontWeight: 700,
          }}
        >
          {formatDateBadge(date)}
        </Typography>
      </Stack>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" gap={1.5}>
        <Box>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>累計實得</Typography>
          <Box sx={{ fontFamily: "ui-monospace, Menlo, monospace", mt: 0.25 }}>
            <Box
              component="span"
              sx={{ fontSize: 32, fontWeight: 700, color: COLOR.amberText, lineHeight: 1 }}
            >
              {effective_exp}
            </Box>
            <Box component="span" sx={{ fontSize: 13, opacity: 0.85, ml: 0.5 }}>
              / {raw_exp} 原始
            </Box>
          </Box>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>訊息</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, mt: 0.25 }}>
            {msg_count}
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ mt: 1.75 }}>
        <Stack direction="row" gap="2px" sx={{ height: 8 }}>
          {w1 > 0 && <Box sx={{ width: `${w1}%`, bgcolor: COLOR.amber, borderRadius: 0.5 }} />}
          {w2 > 0 && <Box sx={{ width: `${w2}%`, bgcolor: COLOR.amberDeep, borderRadius: 0.5 }} />}
          {w3 > 0 && <Box sx={{ width: `${w3}%`, bgcolor: "#9CA3AF", borderRadius: 0.5 }} />}
          {wRest > 0 && (
            <Box
              sx={{ width: `${wRest}%`, bgcolor: "rgba(255,255,255,0.27)", borderRadius: 0.5 }}
            />
          )}
        </Stack>
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{
            mt: 0.5,
            fontSize: 10,
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          <Box component="span" sx={{ color: tierColor, fontWeight: 700 }}>
            {tierLabel}
          </Box>
          <Box component="span" sx={{ opacity: 0.85 }}>
            {raw_exp} / {tier2_upper}+ 原始
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
