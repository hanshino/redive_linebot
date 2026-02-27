import { Card, CardContent, Box, Typography, Skeleton } from "@mui/material";

export default function StatsCard({ icon: Icon, label, value, loading }) {
  return (
    <Card
      sx={{
        height: "100%",
        cursor: "default",
        transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out",
      }}
    >
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 2.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: "rgba(108, 99, 255, 0.1)",
            color: "primary.main",
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 28 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          {loading ? (
            <Skeleton width={80} height={32} />
          ) : (
            <Typography variant="h5" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {typeof value === "number" ? value.toLocaleString() : value ?? "—"}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
