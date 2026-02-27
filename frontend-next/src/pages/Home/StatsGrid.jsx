import { useState, useEffect } from "react";
import { Grid } from "@mui/material";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import PeopleIcon from "@mui/icons-material/People";
import TextsmsIcon from "@mui/icons-material/Textsms";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import CommentIcon from "@mui/icons-material/Comment";
import StatsCard from "./StatsCard";
import { getLineBotData } from "../../services/statistics";

const statsConfig = [
  { key: "CustomerOrderCount", label: "自訂指令", icon: LibraryBooksIcon },
  { key: "GuildCount", label: "群組數", icon: PeopleIcon },
  { key: "TotalSpeakTimes", label: "訊息紀錄", icon: TextsmsIcon },
  { key: "UserCount", label: "用戶數", icon: InsertEmoticonIcon },
  { key: "onlineCount", label: "線上人數", icon: DirectionsRunIcon },
  { key: "speakTimes", label: "即時訊息數", icon: CommentIcon },
];

export default function StatsGrid() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLineBotData()
      .then(setData)
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {statsConfig.map(({ key, label, icon }) => (
        <Grid size={{ xs: 6, sm: 4, md: 2 }} key={key}>
          <StatsCard icon={icon} label={label} value={data[key]} loading={loading} />
        </Grid>
      ))}
    </Grid>
  );
}
