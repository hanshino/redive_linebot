import { useEffect } from "react";
import { Container, Typography, Alert } from "@mui/material";

export default function Prestige() {
  useEffect(() => {
    document.title = "轉生之路";
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        轉生之路
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        探索五道試煉，成為覺醒者
      </Typography>
      <Alert severity="info">
        Prestige dispatcher is under construction. Subviews land in M6-4.
      </Alert>
    </Container>
  );
}
