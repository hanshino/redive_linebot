import { useEffect, useState } from "react";
import { Box, Typography, Grid, Tabs, Tab, Paper, Skeleton } from "@mui/material";
import { EmojiEvents, Casino, Diamond, MilitaryTech } from "@mui/icons-material";
import OverviewCard, { RANK_COLORS } from "./OverviewCard";
import ChatLevelChart from "./ChatLevelChart";
import GachaRankChart from "./GachaRankChart";
import GodStoneChart from "./GodStoneChart";
import AchievementRankChart from "./AchievementRankChart";
import {
  useChatLevelData,
  useGachaRankData,
  useGodStoneData,
  useAchievementRankData,
} from "./hooks";

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function Rankings() {
  const [tab, setTab] = useState(0);
  const level = useChatLevelData();
  const gacha = useGachaRankData();
  const godStone = useGodStoneData();
  const achievement = useAchievementRankData();

  useEffect(() => {
    document.title = "各大排行榜";
  }, []);

  const cards = [
    {
      icon: <EmojiEvents sx={{ fontSize: 28, color: RANK_COLORS.level }} />,
      title: "聽說他沒在睡覺",
      topName: level.topEntry?.displayName,
      topValue: level.topEntry ? `Lv.${level.topEntry.level}` : undefined,
      count: level.count,
      color: RANK_COLORS.level,
      loading: level.loading,
    },
    {
      icon: <Casino sx={{ fontSize: 28, color: RANK_COLORS.gacha }} />,
      title: "氣運好到不行",
      topName: gacha.topEntry?.displayName,
      topValue: gacha.topEntry?.value?.toLocaleString(),
      count: gacha.count,
      color: RANK_COLORS.gacha,
      loading: gacha.loading,
    },
    {
      icon: <Diamond sx={{ fontSize: 28, color: RANK_COLORS.godStone }} />,
      title: "什麼都賣了",
      topName: godStone.topEntry?.displayName,
      topValue: godStone.topEntry?.value?.toLocaleString(),
      count: godStone.count,
      color: RANK_COLORS.godStone,
      loading: godStone.loading,
    },
    {
      icon: <MilitaryTech sx={{ fontSize: 28, color: RANK_COLORS.achievement }} />,
      title: "獎盃獵人",
      topName: achievement.topEntry?.displayName,
      topValue: achievement.topEntry?.value?.toLocaleString(),
      count: achievement.count,
      color: RANK_COLORS.achievement,
      loading: achievement.loading,
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
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
            {card.loading ? (
              <Skeleton variant="rounded" height={160} />
            ) : (
              <OverviewCard {...card} onClick={() => setTab(i)} />
            )}
          </Grid>
        ))}
      </Grid>

      {/* Tabbed Charts */}
      <Paper sx={{ p: { xs: 1, sm: 2 } }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          textColor="inherit"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            "& .MuiTab-root": { fontWeight: 600, minWidth: 72 },
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Tab label="等級排行" />
          <Tab label="轉蛋蒐集" />
          <Tab label="女神石" />
          <Tab label="成就蒐集" />
        </Tabs>
        <TabPanel value={tab} index={0}>
          <ChatLevelChart />
        </TabPanel>
        <TabPanel value={tab} index={1}>
          <GachaRankChart />
        </TabPanel>
        <TabPanel value={tab} index={2}>
          <GodStoneChart />
        </TabPanel>
        <TabPanel value={tab} index={3}>
          <AchievementRankChart />
        </TabPanel>
      </Paper>
    </Box>
  );
}
