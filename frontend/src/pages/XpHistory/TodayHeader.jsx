import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { formatDateBadge } from "./dateTpe";
import { getHeroTokens } from "./xpTokens";

// 配色見 xpTokens.getHeroTokens。鍊金之霧 turns exp into 女神石 — 紫色讓它跟
// 其他地方「保留下來的經驗 = 琥珀」的語彙分開。

// 「1 XP = 💎1」 reads like machinery; at 1:1 say it in words. Any other rate
// keeps the numeric form, which is the only way it stays true.
function alchemyRateText(rate) {
  if (!rate) return "經驗鍊成女神石";
  return rate === 1 ? "經驗 1:1 鍊成女神石" : `${rate} XP 鍊成 💎1`;
}

// Fields are absent on older cached summaries; no alchemy_exp means an ordinary
// day, and a protected player mints nothing so they stay on the normal header.
function alchemyState(summary) {
  const exp = Number(summary.alchemy_exp) || 0;
  if (exp <= 0) return null;
  return {
    exp,
    rate: Number(summary.alchemy_rate) || null,
    stones: Number(summary.alchemy_stones) || 0,
  };
}

export default function TodayHeader({ summary }) {
  const hero = getHeroTokens(useTheme());
  if (!summary) return null;
  const { date, raw_exp, effective_exp, msg_count, tier1_upper, tier2_upper } = summary;
  const alchemy = alchemyState(summary);
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
  const tierColor = t3Used > 0 ? hero.danger : hero.accent;

  // Diminishing returns still apply under 鍊金之霧 — exp is diverted to stones
  // *after* the tier factor, so the same tier bar predicts minting. Only the
  // paint changes, which means it needs no rate at all to stay correct.
  const barT1 = alchemy ? hero.violetLight : hero.bar1;
  const barT2 = alchemy ? hero.violetMid : hero.bar2;

  return (
    <Box
      sx={{
        background: hero.background,
        border: hero.border,
        borderRadius: 1.75,
        p: "18px 18px 16px",
        color: hero.fg,
      }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1.25 }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>今日經驗</Typography>
        <Typography
          sx={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 12,
            color: hero.accent,
            fontWeight: 700,
          }}
        >
          {formatDateBadge(date)}
        </Typography>
      </Stack>

      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "flex-end", gap: 1.5 }}
      >
        <Box>
          <Typography sx={{ fontSize: 12, opacity: 0.85 }}>
            {alchemy ? "今日鍊成" : "累計實得"}
          </Typography>
          <Box sx={{ fontFamily: "ui-monospace, Menlo, monospace", mt: 0.25 }}>
            {alchemy ? (
              <>
                <Box component="span" sx={{ fontSize: 18, mr: 0.5 }}>
                  💎
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: alchemy.stones >= 10000 ? 26 : 32,
                    fontWeight: 700,
                    color: hero.violetLight,
                    lineHeight: 1,
                  }}
                >
                  {alchemy.stones.toLocaleString()}
                </Box>
                <Box component="span" sx={{ fontSize: 13, opacity: 0.85, ml: 0.75 }}>
                  {alchemy.rate === 1 ? "女神石" : `由 ${alchemy.exp.toLocaleString()} XP 鍊成`}
                </Box>
              </>
            ) : (
              <>
                <Box
                  component="span"
                  sx={{ fontSize: 32, fontWeight: 700, color: hero.accent, lineHeight: 1 }}
                >
                  {effective_exp}
                </Box>
                <Box component="span" sx={{ fontSize: 13, opacity: 0.85, ml: 0.5 }}>
                  / {raw_exp} 原始
                </Box>
              </>
            )}
          </Box>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 12, opacity: 0.85 }}>訊息</Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1, mt: 0.25 }}>
            {msg_count}
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ mt: 1.75 }}>
        <Stack direction="row" sx={{ gap: "2px", height: 8 }}>
          {w1 > 0 && <Box sx={{ width: `${w1}%`, bgcolor: barT1, borderRadius: 0.5 }} />}
          {w2 > 0 && <Box sx={{ width: `${w2}%`, bgcolor: barT2, borderRadius: 0.5 }} />}
          {w3 > 0 && <Box sx={{ width: `${w3}%`, bgcolor: hero.bar3, borderRadius: 0.5 }} />}
          {wRest > 0 && (
            <Box sx={{ width: `${wRest}%`, bgcolor: hero.barRest, borderRadius: 0.5 }} />
          )}
        </Stack>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            mt: 0.5,
            flexWrap: "wrap",
            columnGap: 1.5,
            fontSize: 12,
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          <Box
            component="span"
            sx={{ color: alchemy ? hero.violetLight : tierColor, fontWeight: 700 }}
          >
            {alchemy ? `🌫 鍊金之霧 · ${alchemyRateText(alchemy.rate)}` : tierLabel}
          </Box>
          <Box component="span" sx={{ opacity: 0.85 }}>
            {alchemy ? "經驗不累積等級" : `${raw_exp} / ${tier2_upper}+ 原始`}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
