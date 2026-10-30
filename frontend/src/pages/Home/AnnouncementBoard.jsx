import { Box, Skeleton, Typography } from "@mui/material";
import api from "../../services/api";
import LoadError from "../../components/LoadError";
import useApiData from "../XpHistory/useApiData";
import { displayFont } from "../../theme";

const fetchAnnouncements = () => api.get("/api/announcements/1").then(r => r.data || []);

function shortDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
}

const frame = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "14px",
  bgcolor: "background.paper",
  overflow: "hidden",
};

export default function AnnouncementBoard() {
  const { data, loading, error, reload } = useApiData(fetchAnnouncements, true, []);
  const items = (data || []).slice(0, 4);

  return (
    <Box component="section" aria-labelledby="news-heading">
      <Typography
        id="news-heading"
        component="h2"
        sx={{ fontFamily: displayFont, fontWeight: 700, fontSize: "1.0625rem", mb: 1.25, mx: 0.25 }}
      >
        公告板
      </Typography>

      {loading ? (
        <Box sx={{ ...frame, p: 1.5, display: "grid", gap: 1 }}>
          <Skeleton variant="rounded" height={28} />
          <Skeleton variant="rounded" height={28} />
        </Box>
      ) : error ? (
        <LoadError message="公告載入失敗，請稍後再試。" onRetry={reload} sx={{ py: 0 }} />
      ) : items.length === 0 ? (
        <Box sx={{ ...frame, p: 1.5, color: "text.secondary" }}>目前沒有公告</Box>
      ) : (
        <Box sx={frame}>
          {items.map((news, i) => (
            <Box
              component="details"
              key={`${news.create_time}-${i}`}
              open={i === 0}
              sx={{
                borderTop: i ? "1px solid" : 0,
                borderColor: "divider",
                "& > summary::-webkit-details-marker": { display: "none" },
              }}
            >
              <Box
                component="summary"
                sx={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1.25,
                  minHeight: 52,
                  px: 1.5,
                  py: 1.25,
                  "&:hover": { bgcolor: "surface.inset" },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    flex: "none",
                    width: 46,
                    fontFamily: displayFont,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "text.secondary",
                  }}
                >
                  {shortDate(news.create_time)}
                </Box>
                <Box component="span" sx={{ fontWeight: 500 }}>
                  {news.title}
                </Box>
              </Box>
              {news.content && (
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    px: 1.5,
                    pb: 1.5,
                    pl: 8.5,
                    whiteSpace: "pre-line",
                  }}
                >
                  {news.content}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
