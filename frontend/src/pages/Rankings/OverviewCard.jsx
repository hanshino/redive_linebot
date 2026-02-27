import { Card, CardActionArea, CardContent, Typography, Box } from "@mui/material";

const RANK_COLORS = {
  level: "#7c4dff",
  gacha: "#ff6d00",
  godStone: "#00bfa5",
};

export default function OverviewCard({ icon, title, topName, topValue, count, color, onClick }) {
  return (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
        border: `1px solid ${color}33`,
        transition: "transform 0.2s, box-shadow 0.2s",
        "&:hover": { transform: "translateY(-2px)", boxShadow: 4 },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 2 }}>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
            {icon}
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
            {topName || "-"}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color }}>
            {topValue ?? "-"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            共 {count ?? 0} 人參與
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export { RANK_COLORS };
