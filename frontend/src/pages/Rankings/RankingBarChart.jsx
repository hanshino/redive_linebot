import { useMemo } from "react";
import { Box, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

const WIDE_CHAR =
  /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]|[\u{1D400}-\u{1D7FF}]|\p{Extended_Pictographic}/u;

function formatValue(val) {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

function truncateName(name, maxWidth) {
  if (!name) return "";
  let width = 0;
  let out = "";
  for (const ch of name) {
    const w = WIDE_CHAR.test(ch) ? 2 : 1;
    if (width + w > maxWidth) return out + "…";
    width += w;
    out += ch;
  }
  return out;
}

// title：榜單名稱，給圖表的文字摘要用。
export default function RankingBarChart({ data, color, title = "排行" }) {
  const theme = useTheme();
  // 前三名用 theme.palette.medal（深淺模式各自調過）；其餘用榜單色
  const medalColors = theme.palette.medal;
  const barColor = color ?? theme.palette.grey[500];
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const axisWidth = isMobile ? 104 : 140;
  const nameMaxWidth = isMobile ? 9 : 14;
  const rightMargin = isMobile ? 44 : 60;

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
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          暫無數據
        </Typography>
      </Box>
    );
  }

  const height = Math.max(300, chartData.length * 48);
  // 圖是 SVG，螢幕閱讀器讀不到；給前三名的文字摘要
  const summary = `${title}前 ${Math.min(3, chartData.length)} 名：${chartData
    .slice(0, 3)
    .map(d => `第 ${d.rank} 名 ${d.name} ${d.value.toLocaleString()}`)
    .join("，")}。共列出 ${chartData.length} 名。`;

  return (
    <Box role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: rightMargin, left: 8, bottom: 8 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={axisWidth}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={{
              fontSize: 13,
              textAnchor: "start",
              dx: -axisWidth + 4,
              fill: theme.palette.text.primary,
            }}
            tickFormatter={(name, i) => {
              const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
              const prefix = i < 3 ? medals[i] : `${i + 1}.`;
              return `${prefix} ${truncateName(name, nameMaxWidth)}`;
            }}
          />
          <Tooltip
            formatter={val => [val.toLocaleString(), "數值"]}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              color: theme.palette.text.primary,
            }}
            labelStyle={{ color: theme.palette.text.primary }}
            itemStyle={{ color: theme.palette.text.primary }}
            cursor={{ fill: alpha(theme.palette.text.primary, 0.06) }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={i < 3 ? medalColors[i] : barColor}
                fillOpacity={i < 3 ? 0.85 : 0.5}
              />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={formatValue}
              style={{ fontSize: 12, fontWeight: 600, fill: theme.palette.text.primary }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
