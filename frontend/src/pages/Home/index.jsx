import { useEffect } from "react";
import { Box } from "@mui/material";
import HeroBanner from "./HeroBanner";
import TodayCard from "./TodayCard";
import StatsGrid from "./StatsGrid";
import AnnouncementBoard from "./AnnouncementBoard";
import FeatureGrid from "./FeatureGrid";
import useLiff from "../../context/useLiff";

// 閱讀順序：先問候 → 登入者今天能做的事 → 功能入口 → 公告 → 全站統計（參考資訊，放最後）。
export default function Home() {
  const { loggedIn } = useLiff();

  useEffect(() => {
    document.title = "布丁機器人";
  }, []);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <HeroBanner />
      {loggedIn && <TodayCard />}
      <FeatureGrid />
      <AnnouncementBoard />
      <StatsGrid />
    </Box>
  );
}
