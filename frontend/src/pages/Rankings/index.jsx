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
