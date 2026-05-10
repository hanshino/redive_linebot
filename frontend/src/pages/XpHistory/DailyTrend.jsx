import { useMemo } from "react";
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
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

const COLORS = {
  amber: "#FBBF24",
  amberDeep: "#F59E0B",
  divider: "#E5E7EB",
  muted: "#94A3B8",
  lossFg: "#94A3B8",
  text: "#3A2800",
  green: "#16A34A",
  greenDeep: "#15803D",
};

const RANGES = [1, 7, 30, 90, 365];

function rangeLabel(r) {
  if (r === 1) return "今天";
  if (r === 365) return "最近一年";
  return `最近 ${r} 天`;
}

function rangeButton(r) {
  if (r === 1) return "今天";
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
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <Box
      sx={{
        bgcolor: "#fff",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: "8px 12px",
        fontSize: 11,
        fontFamily: "ui-monospace, Menlo, monospace",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        lineHeight: 1.8,
        minWidth: 120,
      }}
    >
      <Box sx={{ color: COLORS.text, fontWeight: 700, mb: 0.25 }}>{d.date}</Box>
      <Box>
        原始{" "}
        <Box component="span" sx={{ color: COLORS.muted }}>
          {d.raw.toLocaleString()}
        </Box>
      </Box>
      <Box>
        實得{" "}
        <Box component="span" sx={{ color: COLORS.amberDeep, fontWeight: 700 }}>
          {d.effective.toLocaleString()}
        </Box>
      </Box>
      <Box sx={{ color: COLORS.muted }}>訊息 {d.msg_count}</Box>
      {d.honeymoon_active && <Box sx={{ color: COLORS.greenDeep, fontSize: 10 }}>🌱 蜜月期</Box>}
      {d.trial_id && <Box sx={{ color: "#B45309", fontSize: 10 }}>⚔ 試煉中</Box>}
    </Box>
  );
}

export default function DailyTrend({ days, range, onRangeChange }) {
  const { chartData, honeymoonBands, trialBands } = useMemo(() => {
    const rows = days || [];
    return {
      chartData: rows.map(d => ({
        date: d.date,
        effective: d.effective_exp || 0,
        loss: Math.max(0, (d.raw_exp || 0) - (d.effective_exp || 0)),
        raw: d.raw_exp || 0,
        msg_count: d.msg_count || 0,
        honeymoon_active: d.honeymoon_active,
        trial_id: d.trial_id,
      })),
      honeymoonBands: bandRanges(rows, d => d.honeymoon_active),
      trialBands: bandRanges(rows, d => d.trial_id != null),
    };
  }, [days]);

  const rotateLabels = chartData.length > 10;
  const tickInterval = chartData.length <= 7 ? 0 : Math.max(0, Math.ceil(chartData.length / 6) - 1);
  const bottomMargin = rotateLabels ? 30 : 18;

  return (
    <Stack gap={1.5}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range}
        onChange={(_, v) => v && onRangeChange(v)}
        fullWidth
      >
        {RANGES.map(r => (
          <ToggleButton key={r} value={r} sx={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
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
          justifyContent="space-between"
          alignItems="baseline"
          sx={{ mb: 1.25 }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
            原始{" "}
            <Box component="span" sx={{ color: COLORS.muted, fontWeight: 400 }}>
              vs
            </Box>{" "}
            實得
          </Typography>
          <Typography
            sx={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              color: COLORS.muted,
            }}
          >
            {rangeLabel(range)}
          </Typography>
        </Stack>

        {chartData.length === 0 ? (
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              maxBarSize={36}
              barCategoryGap="20%"
              margin={{ top: 4, right: 4, bottom: bottomMargin, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 4" stroke={COLORS.divider} vertical={false} />
              {honeymoonBands.map(([x1, x2], i) => (
                <ReferenceArea
                  key={`hm-${i}`}
                  x1={x1}
                  x2={x2}
                  fill={COLORS.green}
                  fillOpacity={0.08}
                />
              ))}
              {trialBands.map(([x1, x2], i) => (
                <ReferenceArea
                  key={`tr-${i}`}
                  x1={x1}
                  x2={x2}
                  fill={COLORS.amberDeep}
                  fillOpacity={0.08}
                />
              ))}
              <XAxis
                dataKey="date"
                tickFormatter={v => {
                  const dateOnly = (v || "").slice(0, 10);
                  return dateOnly.slice(5).replace("-", "/");
                }}
                tick={{
                  fontSize: 9,
                  fontFamily: "system-ui, sans-serif",
                  fill: COLORS.muted,
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
                  fontSize: 9,
                  fontFamily: "system-ui, sans-serif",
                  fill: COLORS.muted,
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                width={28}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar
                dataKey="effective"
                stackId="a"
                fill={COLORS.amber}
                radius={[0, 0, 2, 2]}
                name="effective"
              />
              <Bar
                dataKey="loss"
                stackId="a"
                fill={COLORS.lossFg}
                fillOpacity={0.38}
                radius={[2, 2, 0, 0]}
                name="loss"
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        <Stack
          direction="row"
          gap={1.25}
          flexWrap="wrap"
          sx={{
            mt: 0.5,
            fontSize: 10,
            color: "text.secondary",
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: COLORS.amber, borderRadius: 0.25 }} />
            實得
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                bgcolor: COLORS.lossFg,
                opacity: 0.38,
                borderRadius: 0.25,
              }}
            />
            流失
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{ width: 10, height: 8, bgcolor: COLORS.green, opacity: 0.2, borderRadius: 0.25 }}
            />
            蜜月
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 8,
                bgcolor: COLORS.amberDeep,
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
