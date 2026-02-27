import { useEffect } from "react";
import { Box, Typography } from "@mui/material";
import ChatLevelChart from "./ChatLevelChart";
import GachaRankChart from "./GachaRankChart";
import GodStoneChart from "./GodStoneChart";

export default function Rankings() {
  useEffect(() => {
    document.title = "各大排行榜";
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        各大排行榜
      </Typography>
      <ChatLevelChart />
      <GachaRankChart />
      <GodStoneChart />
    </Box>
  );
}
