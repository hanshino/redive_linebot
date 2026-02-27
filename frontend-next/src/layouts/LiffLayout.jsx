import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";

export default function LiffLayout() {
  const { size } = useParams();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        LIFF Size: {size}
      </Typography>
    </Box>
  );
}
