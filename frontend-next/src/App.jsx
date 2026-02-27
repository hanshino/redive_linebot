import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";

export default function App() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
      }}
    >
      <Typography variant="h4" gutterBottom>
        布丁機器人
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Princess Connect RE:Dive LINE Bot Dashboard
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mt: 4, mb: 4 }}>
        <Button variant="contained" color="primary">
          Primary Action
        </Button>
        <Button variant="contained" color="secondary">
          Gold Accent
        </Button>
        <Button variant="outlined" color="primary">
          Outlined
        </Button>
      </Stack>

      <Card sx={{ maxWidth: 400, width: "100%" }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Theme Preview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This card demonstrates the game-themed dark UI with subtle glow
            effects on hover. The design is inspired by Princess Connect
            RE:Dive's fantasy RPG aesthetic.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
