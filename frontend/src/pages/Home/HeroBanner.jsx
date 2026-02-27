import { Box, Typography } from "@mui/material";

export default function HeroBanner() {
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 3,
        mb: 3,
        overflow: "hidden",
        lineHeight: 0,
      }}
    >
      <Box
        component="img"
        src="/banner.png"
        alt="Princess Connect RE:Dive"
        sx={{
          width: "100%",
          height: "auto",
          display: "block",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          px: { xs: 3, md: 5 },
          lineHeight: "normal",
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 700,
            color: "#fff",
            textShadow: "0 2px 8px rgba(0,0,0,0.3)",
            fontSize: { xs: "1.25rem", md: "2rem" },
          }}
        >
          歡迎回來
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: "rgba(255,255,255,0.85)",
            textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            mt: 0.5,
            fontSize: { xs: "0.75rem", md: "1rem" },
          }}
        >
          公主連結 Line 布丁機器人
        </Typography>
      </Box>
    </Box>
  );
}
