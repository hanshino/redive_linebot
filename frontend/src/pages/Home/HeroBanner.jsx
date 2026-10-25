import { Box, Button, Typography } from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import useLiff from "../../context/useLiff";

// 橫幅圖是淺色底（淺青 + 淺橘），人物在右側、左側留白。
// 所以字用深色直接放在左側留白上，不需要遮罩；窄螢幕圖太矮放不下文字，改成接在圖下方。
export default function HeroBanner() {
  const { loggedIn, profile, login } = useLiff();
  const name = profile?.displayName;

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 3,
        mb: 3,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
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
          position: { xs: "static", sm: "absolute" },
          top: 0,
          left: 0,
          bottom: 0,
          // 疊在圖上時限制在左側留白內，不壓到角色
          maxWidth: { sm: "58%" },
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 1.5,
          p: { xs: 2, sm: 3, md: 5 },
          color: { xs: "text.primary", sm: "grey.900" },
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontWeight: 700,
            fontSize: { xs: "1.25rem", sm: "1.5rem", md: "2rem" },
            overflowWrap: "anywhere",
          }}
        >
          {loggedIn ? `歡迎回來${name ? `，${name}` : ""}` : "歡迎來到布丁機器人"}
        </Typography>
        {!loggedIn && (
          <Button
            variant="contained"
            startIcon={<LoginIcon />}
            onClick={login}
            sx={{ minHeight: 44 }}
          >
            登入
          </Button>
        )}
      </Box>
    </Box>
  );
}
