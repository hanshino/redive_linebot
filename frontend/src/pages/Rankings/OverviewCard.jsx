import { Card, CardActionArea, CardContent, Typography, Box } from "@mui/material";
import { alpha } from "@mui/material/styles";

// title 與分頁名稱一致（點卡片就是切到那個分頁）。
export default function OverviewCard({
  icon,
  title,
  topName,
  topValue,
  count,
  color,
  error = false,
  onClick,
}) {
  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${alpha(color, 0.13)} 0%, ${alpha(color, 0.03)} 100%)`,
        border: `1px solid ${alpha(color, 0.2)}`,
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 2 }}>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            {icon}
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
          </Box>
          {error ? (
            <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
              載入失敗，點開重試
            </Typography>
          ) : (
            <>
              <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
                {topName || "-"}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color }}>
                {topValue ?? "-"}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                共 {count ?? 0} 人參與
              </Typography>
            </>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
