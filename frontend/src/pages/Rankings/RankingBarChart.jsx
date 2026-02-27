import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
const DEFAULT_COLOR = "#90a4ae";

function formatValue(val) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

export default function RankingBarChart({ data, color = DEFAULT_COLOR }) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    return data.slice(0, 10).map((d, i) => ({
      name: d.displayName || `#${i + 1}`,
      value: d.value,
      rank: i + 1,
    }));
  }, [data]);

  if (!chartData.length) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300 }}>
        <Typography color="text.secondary">暫無數據</Typography>
      </Box>
    );
  }

  const height = Math.max(300, chartData.length * 48);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 8 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 13 }}
          tickFormatter={(name, i) => {
            const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
            const prefix = i < 3 ? medals[i] : `${i + 1}.`;
            return `${prefix} ${name}`;
          }}
        />
        <Tooltip formatter={(val) => [val.toLocaleString(), "數值"]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={i < 3 ? MEDAL_COLORS[i] : color} fillOpacity={i < 3 ? 0.85 : 0.5} />
          ))}
          <LabelList dataKey="value" position="right" formatter={formatValue} style={{ fontSize: 12, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
