import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import useLiff from "../context/useLiff";

/**
 * 權限不足的 403 頁面，取代原本「靜默導回首頁」。
 *
 * 未登入時給登入鍵（登入後可能就有權限了）；已登入但沒權限就只說明原因，
 * 兩種情況都留一個回首頁的連結。
 */
export default function AccessDenied({ title }) {
  const { loggedIn, login } = useLiff();

  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 4, sm: 8 } }}>
      <Paper
        elevation={0}
        role="alert"
        sx={{
          maxWidth: 420,
          width: "100%",
          p: { xs: 3, sm: 4 },
          textAlign: "center",
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
        }}
      >
        <LockOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
        <Typography variant="h6" component="h1" sx={{ mt: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        {!loggedIn && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            請先登入。
          </Typography>
        )}
        <Stack spacing={1} sx={{ mt: 3, alignItems: "stretch" }}>
          {!loggedIn && (
            <Button variant="contained" onClick={login} sx={{ minHeight: 44 }}>
              登入
            </Button>
          )}
          <Button component={RouterLink} to="/" sx={{ minHeight: 44 }}>
            回到首頁
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
