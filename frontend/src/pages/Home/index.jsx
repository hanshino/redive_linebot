import { useEffect } from "react";
import { Box } from "@mui/material";
import HeroBanner from "./HeroBanner";
import StatsGrid from "./StatsGrid";
import AnnouncementBoard from "./AnnouncementBoard";
import FeatureGrid from "./FeatureGrid";

export default function Home() {
  useEffect(() => {
    document.title = "布丁機器人";
  }, []);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <HeroBanner />
      <StatsGrid />
      <AnnouncementBoard />
      <FeatureGrid />
    </Box>
  );
}
