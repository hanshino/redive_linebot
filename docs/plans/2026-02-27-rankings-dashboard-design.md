# Rankings Dashboard Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the rankings page from three stacked DataGrid tables into a visual dashboard with overview cards and tabbed Recharts bar charts.

**Architecture:** Top section shows three clickable summary cards (one per ranking). Bottom section uses MUI Tabs to switch between three horizontal bar charts built with Recharts. All three APIs are fetched concurrently on mount; data flows from a shared parent into child components via props.

**Tech Stack:** React 19, MUI v7 (Grid, Card, Tabs, TabPanel), Recharts v3 (already installed), axios-hooks

---

### Task 1: Create OverviewCard component

**Files:**
- Create: `frontend/src/pages/Rankings/OverviewCard.jsx`

**Step 1: Create the reusable summary card**

```jsx
import { Card, CardActionArea, CardContent, Typography, Box } from "@mui/material";

const RANK_COLORS = {
  level: "#7c4dff",
  gacha: "#ff6d00",
  godStone: "#00bfa5",
};

export default function OverviewCard({ icon, title, topName, topValue, count, color, onClick }) {
  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
        border: `1px solid ${color}33`,
        transition: "transform 0.2s, box-shadow 0.2s",
        "&:hover": { transform: "translateY(-2px)", boxShadow: 4 },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 2 }}>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            <Typography variant="h5" component="span">{icon}</Typography>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
            {topName || "-"}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color }}>
            {topValue ?? "-"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            共 {count ?? 0} 人參與
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export { RANK_COLORS };
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Rankings/OverviewCard.jsx
git commit -m "feat: add OverviewCard component for rankings dashboard"
```

---

### Task 2: Create RankingBarChart component

**Files:**
- Create: `frontend/src/pages/Rankings/RankingBarChart.jsx`

**Step 1: Create the reusable horizontal bar chart**

This component takes an array of `{ name, value }` and renders a horizontal Recharts BarChart with gold/silver/bronze coloring for top 3.

```jsx
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
            const medals = ["🥇", "🥈", "🥉"];
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
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Rankings/RankingBarChart.jsx
git commit -m "feat: add RankingBarChart component with medal coloring"
```

---

### Task 3: Refactor ChatLevelChart to use bar chart

**Files:**
- Modify: `frontend/src/pages/Rankings/ChatLevelChart.jsx`

**Step 1: Rewrite to export data-fetching hook and bar chart**

Replace the entire file. The component now receives no props — it fetches its own data and renders a `RankingBarChart`.

```jsx
import { useMemo } from "react";
import useAxios from "axios-hooks";
import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";

export function useChatLevelData() {
  const [{ data, loading }] = useAxios("/api/Chat/Level/Rank");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((d, i) => ({
      displayName: d.displayName,
      value: d.experience,
      level: d.level,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export default function ChatLevelChart() {
  const { rows } = useChatLevelData();
  return <RankingBarChart data={rows} color={RANK_COLORS.level} />;
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Rankings/ChatLevelChart.jsx
git commit -m "refactor: ChatLevelChart to use RankingBarChart"
```

---

### Task 4: Refactor GachaRankChart to use bar chart

**Files:**
- Modify: `frontend/src/pages/Rankings/GachaRankChart.jsx`

**Step 1: Rewrite**

```jsx
import { useMemo } from "react";
import useAxios from "axios-hooks";
import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";

export function useGachaRankData() {
  const [{ data, loading }] = useAxios("/api/Gacha/Rank/0");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      displayName: d.displayName,
      value: d.cnt,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export default function GachaRankChart() {
  const { rows } = useGachaRankData();
  return <RankingBarChart data={rows} color={RANK_COLORS.gacha} />;
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Rankings/GachaRankChart.jsx
git commit -m "refactor: GachaRankChart to use RankingBarChart"
```

---

### Task 5: Refactor GodStoneChart to use bar chart

**Files:**
- Modify: `frontend/src/pages/Rankings/GodStoneChart.jsx`

**Step 1: Rewrite**

```jsx
import { useMemo } from "react";
import useAxios from "axios-hooks";
import RankingBarChart from "./RankingBarChart";
import { RANK_COLORS } from "./OverviewCard";

export function useGodStoneData() {
  const [{ data, loading }] = useAxios("/api/God-Stone/Rank");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      displayName: d.displayName,
      value: d.amount,
    }));
  }, [data]);

  return { rows, loading, topEntry: rows[0], count: rows.length };
}

export default function GodStoneChart() {
  const { rows } = useGodStoneData();
  return <RankingBarChart data={rows} color={RANK_COLORS.godStone} />;
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Rankings/GodStoneChart.jsx
git commit -m "refactor: GodStoneChart to use RankingBarChart"
```

---

### Task 6: Rewrite Rankings index page with dashboard layout

**Files:**
- Modify: `frontend/src/pages/Rankings/index.jsx`

**Step 1: Rewrite with overview cards + tabbed charts**

```jsx
import { useEffect, useState } from "react";
import { Box, Typography, Grid, Tabs, Tab, Paper, Skeleton } from "@mui/material";
import OverviewCard, { RANK_COLORS } from "./OverviewCard";
import ChatLevelChart, { useChatLevelData } from "./ChatLevelChart";
import GachaRankChart, { useGachaRankData } from "./GachaRankChart";
import GodStoneChart, { useGodStoneData } from "./GodStoneChart";

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function Rankings() {
  const [tab, setTab] = useState(0);
  const level = useChatLevelData();
  const gacha = useGachaRankData();
  const godStone = useGodStoneData();

  useEffect(() => {
    document.title = "各大排行榜";
  }, []);

  const cards = [
    {
      icon: "👑",
      title: "等級王",
      topName: level.topEntry?.displayName,
      topValue: level.topEntry ? `Lv.${level.topEntry.level}` : undefined,
      count: level.count,
      color: RANK_COLORS.level,
      loading: level.loading,
    },
    {
      icon: "🎰",
      title: "蒐集王",
      topName: gacha.topEntry?.displayName,
      topValue: gacha.topEntry?.value?.toLocaleString(),
      count: gacha.count,
      color: RANK_COLORS.gacha,
      loading: gacha.loading,
    },
    {
      icon: "💎",
      title: "女神石王",
      topName: godStone.topEntry?.displayName,
      topValue: godStone.topEntry?.value?.toLocaleString(),
      count: godStone.count,
      color: RANK_COLORS.godStone,
      loading: godStone.loading,
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        各大排行榜
      </Typography>

      {/* Overview Cards */}
      <Grid container spacing={2}>
        {cards.map((card, i) => (
          <Grid size={{ xs: 12, sm: 4 }} key={i}>
            {card.loading ? (
              <Skeleton variant="rounded" height={160} />
            ) : (
              <OverviewCard {...card} onClick={() => setTab(i)} />
            )}
          </Grid>
        ))}
      </Grid>

      {/* Tabbed Charts */}
      <Paper sx={{ p: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          textColor="inherit"
          sx={{
            "& .MuiTab-root": { fontWeight: 600 },
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Tab label="等級排行" />
          <Tab label="轉蛋蒐集" />
          <Tab label="女神石" />
        </Tabs>
        <TabPanel value={tab} index={0}><ChatLevelChart /></TabPanel>
        <TabPanel value={tab} index={1}><GachaRankChart /></TabPanel>
        <TabPanel value={tab} index={2}><GodStoneChart /></TabPanel>
      </Paper>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Rankings/index.jsx
git commit -m "feat: redesign rankings page as dashboard with cards and tabbed charts"
```

---

### Task 7: Visual verification

**Step 1: Open browser and verify**

Navigate to `http://localhost/rankings` and verify:
- Three overview cards render with correct data
- Clicking a card switches the tab
- Bar charts show correct data with medal coloring
- Responsive layout works (cards stack on narrow viewport)

**Step 2: Take screenshot for review**

---

### Important Notes

- `recharts` v3.7.0 is already installed — no dependency changes needed
- The data hooks are called once in the parent (`index.jsx`) AND once inside each chart component. This means each API is called **twice**. An alternative is to lift all data fetching to the parent and pass via props. However, since `axios-hooks` caches requests by URL, the duplicate calls will be served from cache with no extra network requests. If this is a concern, we can refactor to prop-passing in a follow-up.
- The `@mui/x-data-grid` import is no longer used in the rankings files after this change.
