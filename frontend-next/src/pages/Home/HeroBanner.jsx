import { Box, Typography, Chip } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";

export default function HeroBanner() {
  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        borderRadius: 3,
        p: { xs: 3, md: 5 },
        mb: 3,
        background:
          theme.palette.mode === "dark"
            ? "linear-gradient(135deg, rgba(38, 198, 218, 0.12) 0%, rgba(251, 191, 36, 0.06) 100%)"
            : "linear-gradient(135deg, rgba(0, 172, 193, 0.08) 0%, rgba(245, 158, 11, 0.05) 100%)",
        border: `1px solid ${theme.palette.divider}`,
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            theme.palette.mode === "dark"
              ? "radial-gradient(ellipse at 20% 50%, rgba(38, 198, 218, 0.08) 0%, transparent 70%)"
              : "radial-gradient(ellipse at 20% 50%, rgba(0, 172, 193, 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        },
      })}
    >
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <SmartToyIcon sx={{ fontSize: 32, color: "secondary.main" }} />
          <Typography variant="h4" component="h1">
            布丁機器人
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2, maxWidth: 600 }}>
          Princess Connect RE:Dive LINE Bot Dashboard
        </Typography>
        <Chip
          label="Bot Online"
          color="success"
          size="small"
          sx={{ fontWeight: 600 }}
        />
      </Box>
    </Box>
  );
}
