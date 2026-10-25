import { useMemo } from "react";
import { Box, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import LoadError from "../../components/LoadError";
import { formatDateBadge } from "./dateTpe";
import { weatherEffectLabels } from "./weatherLabels";
import { getXpTokens } from "./xpTokens";

// 配色全部來自 xpTokens（theme.palette）；圖表 props 吃的是實際色值，所以在元件裡取一次。
// 鍊金之霧: exp that became 女神石. Solid violet, not the translucent grey of
// 遞減 — it left the level bar but the player still got paid for it.

// 不放「今天」：單日只會畫出一根長條，看不出趨勢
const RANGES = [7, 30, 90, 365];

function rangeLabel(r) {
  if (r === 365) return "最近一年";
  return `最近 ${r} 天`;
}

function rangeButton(r) {
  if (r === 365) return "1 年";
  return `${r} 天`;
}

function bandRanges(rows, predicate) {
  const out = [];
  let start = null;
  rows.forEach((d, i) => {
    if (predicate(d)) {
      if (start === null) start = i;
    } else if (start !== null) {
      out.push([rows[start].date, rows[i - 1].date]);
      start = null;
    }
  });
  if (start !== null) out.push([rows[start].date, rows[rows.length - 1].date]);
  return out;
}

function TrendTooltip({ active, payload }) {
  const theme = useTheme();
  const c = getXpTokens(theme);
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isBuffDay = d.weather?.category === "buff";
  // 鍊金之霧 is a buff now, but it stays 🌫 violet everywhere else in this page —
  // don't let the generic buff styling recolour it to ☀ green.
  const isAlchemyDay = Boolean(d.weather?.effects?.exp_to_stone_rate);
  const weatherColor = isAlchemyDay ? c.violet : isBuffDay ? c.positive : c.weatherDebuff;
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        color: "text.primary",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: "8px 12px",
        fontSize: 12,
        fontFamily: "ui-monospace, Menlo, monospace",
        boxShadow: `0 2px 8px ${alpha(theme.palette.common.black, 0.12)}`,
        lineHeight: 1.8,
        minWidth: 120,
      }}
    >
      <Box sx={{ color: "text.primary", fontWeight: 700, mb: 0.25 }}>{formatDateBadge(d.date)}</Box>
      <Box>
        原始{" "}
        <Box component="span" sx={{ color: "text.secondary" }}>
          {d.raw.toLocaleString()}
        </Box>
      </Box>
      <Box>
        實得{" "}
        <Box component="span" sx={{ color: c.effectiveText, fontWeight: 700 }}>
          {d.effective.toLocaleString()}
        </Box>
      </Box>
      {d.alchemy_exp > 0 && (
        <Box>
          鍊成{" "}
          <Box component="span" sx={{ color: c.violet, fontWeight: 700 }}>
            💎{d.alchemy_stones.toLocaleString()}
          </Box>{" "}
          <Box component="span" sx={{ color: "text.secondary" }}>
            ({d.alchemy_exp.toLocaleString()} XP)
          </Box>
        </Box>
      )}
      <Box sx={{ color: "text.secondary" }}>訊息 {d.msg_count}</Box>
      {d.honeymoon_active && <Box sx={{ color: c.positive }}>🌱 蜜月期</Box>}
      {d.trial_id && <Box sx={{ color: c.caution }}>⚔ 試煉中</Box>}
      {d.weather && (
        <Box sx={{ color: weatherColor }}>
          {isAlchemyDay ? "🌫" : isBuffDay ? "☀" : "🌫"} {d.weather.name}
          {d.weather_protection === "full"
            ? " · 已防護"
            : ` · ${d.weather_protection === "partial" ? "部分防護 " : ""}${weatherEffectLabels(
                d.weather.effects
              ).join(" ")}`}
        </Box>
      )}
    </Box>
  );
}

// 給螢幕閱讀器的圖表摘要：圖本身是 SVG，讀不出內容。
function summarize(rows, range) {
  if (!rows.length) return `${rangeLabel(range)}沒有資料`;
  const effective = rows.reduce((n, d) => n + d.effective, 0);
  const raw = rows.reduce((n, d) => n + d.raw, 0);
  const peak = rows.reduce((best, d) => (d.effective > best.effective ? d : best), rows[0]);
  return (
    `${rangeLabel(range)}，共 ${rows.length} 天有紀錄。原始 XP 合計 ${raw.toLocaleString()}，` +
    `實得 XP 合計 ${effective.toLocaleString()}。` +
    `單日實得最高是 ${formatDateBadge(peak.date)} 的 ${peak.effective.toLocaleString()}。`
  );
}

export default function DailyTrend({
  days,
  range,
  onRangeChange,
  loading = false,
  error = false,
  onRetry,
}) {
  const theme = useTheme();
  const c = getXpTokens(theme);
  const { chartData, honeymoonBands, trialBands, hasAlchemy } = useMemo(() => {
    const rows = days || [];
    const data = rows.map(d => {
      const raw = d.raw_exp || 0;
      const effective = d.effective_exp || 0;
      // Converted, not lost — subtract it before computing 流失, otherwise an
      // alchemy day charts as a full-height grey bar. The honeymoon ×1.2 is
      // applied after raw, so effective + alchemy can exceed raw; clamp the
      // stack to raw so the bar never draws taller than the day's raw exp.
      const alchemy = Math.min(d.alchemy_exp || 0, Math.max(0, raw - effective));
      return {
        date: d.date,
        effective,
        alchemy,
        loss: Math.max(0, raw - effective - alchemy),
        raw,
        alchemy_stones: d.alchemy_stones || 0,
        alchemy_exp: d.alchemy_exp || 0,
        msg_count: d.msg_count || 0,
        honeymoon_active: d.honeymoon_active,
        trial_id: d.trial_id,
        weather: d.weather,
        weather_protection: d.weather_protection,
      };
    });
    return {
      chartData: data,
      honeymoonBands: bandRanges(rows, d => d.honeymoon_active),
      trialBands: bandRanges(rows, d => d.trial_id != null),
      hasAlchemy: data.some(d => d.alchemy_exp > 0),
    };
  }, [days]);

  const summary = summarize(chartData, range);
  const rotateLabels = chartData.length > 10;
  const tickInterval = chartData.length <= 7 ? 0 : Math.max(0, Math.ceil(chartData.length / 6) - 1);
  const bottomMargin = rotateLabels ? 30 : 18;

  return (
    <Stack sx={{ gap: 1.5 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range}
        onChange={(_, v) => v && onRangeChange(v)}
        fullWidth
      >
        {RANGES.map(r => (
          <ToggleButton
            key={r}
            value={r}
            sx={{ fontFamily: "ui-monospace, Menlo, monospace", minHeight: 44 }}
          >
            {rangeButton(r)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box
        sx={{
          bgcolor: "background.paper",
          borderRadius: 1.5,
          border: 1,
          borderColor: "divider",
          p: "14px 12px 10px",
        }}
      >
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1.25 }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
            原始{" "}
            <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
              vs
            </Box>{" "}
            實得
          </Typography>
          <Typography
            sx={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            {rangeLabel(range)}
          </Typography>
        </Stack>

        {loading ? (
          <Skeleton variant="rounded" height={220} animation="wave" />
        ) : error ? (
          <LoadError message="每日趨勢載入失敗，請檢查網路後再試一次。" onRetry={onRetry} />
        ) : chartData.length === 0 ? (
          <Box
            sx={{
              py: 6,
              textAlign: "center",
              color: "text.secondary",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12,
            }}
          >
            沒有資料
          </Box>
        ) : (
          <Box role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={chartData}
                maxBarSize={36}
                barCategoryGap="20%"
                margin={{ top: 4, right: 4, bottom: bottomMargin, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 4" stroke={c.grid} vertical={false} />
                {honeymoonBands.map(([x1, x2], i) => (
                  <ReferenceArea
                    key={`hm-${i}`}
                    x1={x1}
                    x2={x2}
                    fill={c.positive}
                    fillOpacity={0.1}
                  />
                ))}
                {trialBands.map(([x1, x2], i) => (
                  <ReferenceArea
                    key={`tr-${i}`}
                    x1={x1}
                    x2={x2}
                    fill={c.caution}
                    fillOpacity={0.1}
                  />
                ))}
                <XAxis
                  dataKey="date"
                  tickFormatter={v => {
                    const dateOnly = (v || "").slice(0, 10);
                    return dateOnly.slice(5).replace("-", "/");
                  }}
                  tick={{
                    fontSize: 12,
                    fontFamily: "system-ui, sans-serif",
                    fill: c.textMuted,
                  }}
                  interval={tickInterval}
                  angle={rotateLabels ? -40 : 0}
                  textAnchor={rotateLabels ? "end" : "middle"}
                  axisLine={false}
                  tickLine={false}
                  dy={4}
                />
                <YAxis
                  tick={{
                    fontSize: 12,
                    fontFamily: "system-ui, sans-serif",
                    fill: c.textMuted,
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  width={34}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{ fill: alpha(theme.palette.text.primary, 0.06) }}
                />
                <Bar
                  dataKey="effective"
                  stackId="a"
                  fill={c.effectiveBar}
                  radius={[0, 0, 2, 2]}
                  name="effective"
                />
                <Bar dataKey="alchemy" stackId="a" fill={c.violet} name="alchemy" />
                <Bar
                  dataKey="loss"
                  stackId="a"
                  fill={c.lossFill}
                  fillOpacity={0.38}
                  radius={[2, 2, 0, 0]}
                  name="loss"
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}

        <Stack
          direction="row"
          sx={{
            gap: 1.25,
            flexWrap: "wrap",
            mt: 0.5,
            fontSize: 12,
            color: "text.secondary",
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: c.effectiveBar, borderRadius: 0.25 }} />
            實得
          </Box>
          {hasAlchemy && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, bgcolor: c.violet, borderRadius: 0.25 }} />
              鍊成女神石
            </Box>
          )}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                bgcolor: c.lossFill,
                opacity: 0.38,
                borderRadius: 0.25,
              }}
            />
            遞減
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{ width: 10, height: 8, bgcolor: c.positive, opacity: 0.2, borderRadius: 0.25 }}
            />
            蜜月
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 8,
                bgcolor: c.caution,
                opacity: 0.2,
                borderRadius: 0.25,
              }}
            />
            試煉
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
