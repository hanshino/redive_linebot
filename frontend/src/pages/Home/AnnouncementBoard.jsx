import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CampaignIcon from "@mui/icons-material/Campaign";
import api from "../../services/api";
import LoadError from "../../components/LoadError";

export default function AnnouncementBoard() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAnnouncements = useCallback(() => {
    return (
      api
        .get("/api/announcements/1")
        .then(r => setAnnouncements(r.data || []))
        // 載入失敗不能說「目前沒有公告」，那是在騙人；顯示錯誤並可重試
        .catch(() => setError(true))
        .finally(() => setLoading(false))
    );
  }, []);

  // 首次載入 loading 本來就是 true；只有重試才需要把狀態重設
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const load = () => {
    setLoading(true);
    setError(false);
    fetchAnnouncements();
  };

  const breakingNews = announcements[0];
  const otherNews = announcements.slice(1, 4);

  if (loading) {
    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Skeleton height={32} width={120} sx={{ mb: 2 }} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <CampaignIcon sx={{ color: "secondary.main" }} />
          <Typography variant="h6">公告欄</Typography>
        </Box>

        {error ? (
          <LoadError message="公告載入失敗，請稍後再試。" onRetry={load} sx={{ py: 0 }} />
        ) : breakingNews ? (
          <Alert
            severity={breakingNews.severity || "info"}
            sx={{ mb: otherNews.length > 0 ? 2 : 0 }}
          >
            <Typography variant="subtitle2">{breakingNews.title}</Typography>
            {breakingNews.content && (
              <Typography variant="body2">{breakingNews.content}</Typography>
            )}
          </Alert>
        ) : (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            目前沒有公告
          </Typography>
        )}

        {otherNews.map((news, index) => (
          <Accordion
            key={index}
            disableGutters
            sx={{
              bgcolor: "transparent",
              "&::before": { display: "none" },
              boxShadow: "none",
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">{news.title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                }}
              >
                {news.content}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  );
}
