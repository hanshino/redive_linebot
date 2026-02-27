import { Box, Typography, Chip } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";

export default function HeroBanner() {
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 3,
        p: { xs: 3, md: 5 },
        mb: 3,
        background: "linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(255, 184, 48, 0.08) 100%)",
        border: "1px solid rgba(108, 99, 255, 0.2)",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(ellipse at 20% 50%, rgba(108, 99, 255, 0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        },
      }}
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
