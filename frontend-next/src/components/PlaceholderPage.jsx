import { Box, Typography, Chip } from "@mui/material";
import ConstructionIcon from "@mui/icons-material/Construction";

export default function PlaceholderPage({ title }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 2,
      }}
    >
      <ConstructionIcon sx={{ fontSize: 48, color: "secondary.main" }} />
      <Typography variant="h5">{title}</Typography>
      <Chip label="Phase 1 — Placeholder" color="primary" variant="outlined" />
    </Box>
  );
}
