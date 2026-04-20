import { Box, Typography } from "@mui/material";

export default function StatItem({ label, value, highlight }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          display: "block",
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, color: highlight ? "warning.main" : "text.primary" }}
      >
        {value}
      </Typography>
    </Box>
  );
}
