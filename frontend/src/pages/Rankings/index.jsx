import { useEffect, useState } from "react";
import { Box, Typography, Grid, Tabs, Tab, Paper, Skeleton } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { EmojiEvents, Casino, Diamond, MilitaryTech } from "@mui/icons-material";
import LoadError from "../../components/LoadError";
import OverviewCard from "./OverviewCard";
import RankingBarChart from "./RankingBarChart";
import PrestigeRankList from "./PrestigeRankList";
import SupportRankList from "./SupportRankList";
import {
  useChatLevelData,
  useGachaRankData,
  useGodStoneData,
  useAchievementRankData,
} from "./hooks";

// 分頁標籤與總覽卡片共用這張表：卡片標題 = 分頁名稱，
// 兩邊不會再各寫一份而對不上。支持榜沒有總覽卡，所以不在這裡。
const RANK_TABS = [
  {
    key: "level",
    label: "等級排行",
    Icon: EmojiEvents,
    color: p => p.rarity[1].main,
    valueText: top => `Lv.${top.level}`,
  },
  {
    key: "gacha",
    label: "轉蛋蒐集",
    Icon: Casino,
    color: p => p.rarity[3].main,
    valueText: top => top.value?.toLocaleString(),
  },
  {
    key: "godStone",
    label: "女神石",
    Icon: Diamond,
    color: p => p.currency.main,
    valueText: top => top.value?.toLocaleString(),
  },
  {
    key: "achievement",
    label: "成就蒐集",
    Icon: MilitaryTech,
    color: p => p.rarity[2].main,
    valueText: top => top.value?.toLocaleString(),
  },
];

const SUPPORT_TAB_INDEX = RANK_TABS.length;

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

// 榜單面板：載入中 / 失敗（可重試）/ 圖表，三態分開，失敗不會顯示成「暫無數據」。
function RankPanel({ source, title, color, children }) {
  if (source.loading) return <Skeleton variant="rounded" height={300} />;
  if (source.error) {
    return (
      <LoadError message={`${title}載入失敗，請檢查網路後再試一次。`} onRetry={source.refetch} />
    );
  }
  return (
    <>
      <RankingBarChart data={source.rows} color={color} title={title} />
      {children}
    </>
  );
}

export default function Rankings() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const sources = {
    level: useChatLevelData(),
    gacha: useGachaRankData(),
    godStone: useGodStoneData(),
    achievement: useAchievementRankData(),
  };

  useEffect(() => {
    document.title = "各大排行榜";
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        各大排行榜
      </Typography>

      {/* Overview Cards */}
      <Grid container spacing={2}>
        {RANK_TABS.map(({ key, label, Icon, color, valueText }, i) => {
          const source = sources[key];
          const accent = color(theme.palette);
          return (
            <Grid size={{ xs: 6, md: 3 }} key={key}>
              {source.loading ? (
                <Skeleton variant="rounded" height={160} />
              ) : (
                <OverviewCard
                  icon={<Icon sx={{ fontSize: 28, color: accent }} />}
                  title={label}
                  topName={source.topEntry?.displayName}
                  topValue={source.topEntry ? valueText(source.topEntry) : undefined}
                  count={source.count}
                  color={accent}
                  error={source.error}
                  onClick={() => setTab(i)}
                />
              )}
            </Grid>
          );
        })}
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
          {RANK_TABS.map(({ key, label }) => (
            <Tab key={key} label={label} />
          ))}
          <Tab label="支持榜" />
        </Tabs>
        {RANK_TABS.map(({ key, label, color }, i) => (
          <TabPanel key={key} value={tab} index={i}>
            <RankPanel source={sources[key]} title={label} color={color(theme.palette)}>
              {key === "level" && <PrestigeRankList rows={sources.level.rows} />}
            </RankPanel>
          </TabPanel>
        ))}
        <TabPanel value={tab} index={SUPPORT_TAB_INDEX}>
          <SupportRankList />
        </TabPanel>
      </Paper>
    </Box>
  );
}
