import { useEffect } from "react";
import { Box } from "@mui/material";
import AdventurerCard from "./AdventurerCard";
import TodayStrip from "./TodayStrip";
import FeatureBinder from "./FeatureBinder";
import AnnouncementBoard from "./AnnouncementBoard";
import useLiff from "../../context/useLiff";
import useApiData from "../XpHistory/useApiData";
import api from "../../services/api";
import { getPrestigeStatus } from "../../services/prestige";

const fetchSignins = () => api.get("/api/me/signins").then(r => r.data);
const fetchBoss = () => api.get("/api/world-boss/me").then(r => r.data);

// 冒險者卡冊：手機先看到自己的卡與今天沒做完的事，再往下翻功能卡；
// 桌機左欄固定卡片，右欄是卡冊與公告。
export default function Home() {
  const { ready, loggedIn, login, profile } = useLiff();
  const signins = useApiData(fetchSignins, loggedIn, [loggedIn]);
  const prestige = useApiData(getPrestigeStatus, loggedIn, [loggedIn]);
  const boss = useApiData(fetchBoss, loggedIn, [loggedIn]);

  useEffect(() => {
    document.title = "布丁機器人";
  }, []);

  const bossLeft = boss.data?.current?.daily?.remaining;

  return (
    <Box
      sx={{
        maxWidth: 1280,
        mx: "auto",
        display: "grid",
        gap: { xs: 2.25, md: 3 },
        gridTemplateColumns: { md: "340px minmax(0, 1fr)", lg: "360px minmax(0, 1fr)" },
        alignItems: "start",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gap: 2,
          position: { md: "sticky" },
          top: { md: 88 },
        }}
      >
        <AdventurerCard
          ready={ready}
          loggedIn={loggedIn}
          login={login}
          profile={profile}
          prestige={prestige}
          signins={signins}
        />
        {loggedIn && <TodayStrip signins={signins} boss={boss} />}
      </Box>

      <Box sx={{ display: "grid", gap: { xs: 2.25, md: 3 } }}>
        <FeatureBinder badges={bossLeft > 0 ? { worldboss: `今日剩 ${bossLeft}` } : {}} />
        <AnnouncementBoard />
      </Box>
    </Box>
  );
}
