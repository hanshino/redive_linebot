import { useState, useEffect, useCallback } from "react";
import { Box, Grid, Typography } from "@mui/material";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import PeopleIcon from "@mui/icons-material/People";
import TextsmsIcon from "@mui/icons-material/Textsms";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import CommentIcon from "@mui/icons-material/Comment";
import StatsCard from "./StatsCard";
import LoadError from "../../components/LoadError";
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
  const [error, setError] = useState(false);

  const fetchStats = useCallback(() => {
    return (
      getLineBotData()
        .then(setData)
        // 失敗時不要留一排「—」假裝是數字，改顯示錯誤與重試
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    );
  }, []);

  // 首次載入 loading 本來就是 true；只有重試才需要把狀態重設
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const load = () => {
    setLoading(true);
    setError(false);
    fetchStats();
  };

  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        機器人統計
      </Typography>
      {error ? (
        <LoadError message="統計資料載入失敗，請稍後再試。" onRetry={load} sx={{ py: 0 }} />
      ) : (
        <Grid container spacing={2}>
          {statsConfig.map(({ key, label, icon }) => (
            <Grid size={{ xs: 6, sm: 4, md: 4, xl: 2 }} key={key}>
              <StatsCard icon={icon} label={label} value={data[key]} loading={loading} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
