import { Card, CardContent, Box, Typography, Skeleton } from "@mui/material";
import { alpha } from "@mui/material/styles";

export default function StatsCard({ icon: Icon, label, value, loading }) {
  return (
    <Card
      sx={{
        height: "100%",
      }}
    >
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 2.5 }}>
        <Box
          sx={{
            // 手機兩欄時卡片只有 ~140px 寬，圖示讓出空間給數字，大數字才不會被截成「9,99…」
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: theme => alpha(theme.palette.primary.main, 0.1),
            color: "primary.main",
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 28 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            noWrap
            sx={{
              color: "text.secondary",
            }}
          >
            {label}
          </Typography>
          {loading ? (
            <Skeleton width={80} height={32} />
          ) : (
            <Typography variant="h5" noWrap sx={{ fontVariantNumeric: "tabular-nums" }}>
              {typeof value === "number" ? value.toLocaleString() : (value ?? "—")}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
