import { Link as RouterLink } from "react-router-dom";
import { Grid, Card, CardActionArea, CardContent, Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import StorefrontIcon from "@mui/icons-material/Storefront";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import SportsMmaIcon from "@mui/icons-material/SportsMma";
import MenuBookIcon from "@mui/icons-material/MenuBook";

// 只列「點了真的會去某個頁面」的功能。專屬指令、公會管理、遊戲查詢、公會戰這幾項
// 只能在 LINE 聊天室使用，沒有網頁入口，指令說明統一收在「使用手冊」。
// 標籤本身就說明了去向，所以不另加描述文字。
// color 是 theme.palette 的 key，不寫死色碼，深淺模式各自對應。
const features = [
  {
    icon: RecordVoiceOverIcon,
    label: "幹話等級",
    path: "/rankings",
    color: "secondary",
  },
  {
    icon: StorefrontIcon,
    label: "轉蛋商店",
    path: "/gacha/exchange",
    color: "primary",
  },
  {
    icon: FitnessCenterIcon,
    label: "裝備管理",
    path: "/equipment",
    color: "success",
  },
  {
    icon: SettingsSuggestIcon,
    label: "自動設定",
    path: "/auto/settings",
    color: "primary",
  },
  {
    icon: SportsMmaIcon,
    label: "今日自動配對",
    path: "/auto/match",
    color: "secondary",
  },
  {
    icon: MenuBookIcon,
    label: "使用手冊",
    path: "/panel/manual",
    color: "success",
  },
];

export default function FeatureGrid() {
  return (
    <Box component="section" sx={{ mb: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        功能一覽
      </Typography>
      <Grid container spacing={2}>
        {features.map(({ icon: Icon, label, path, color }) => (
          <Grid size={{ xs: 6, sm: 4, md: 4 }} key={label}>
            <Card sx={{ height: "100%" }}>
              <CardActionArea
                component={RouterLink}
                to={path}
                sx={{ height: "100%", p: 2, minHeight: 44 }}
              >
                <CardContent sx={{ textAlign: "center", p: 0 }}>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      bgcolor: theme => alpha(theme.palette[color].main, 0.1),
                      mb: 1.5,
                    }}
                  >
                    <Icon sx={{ fontSize: 32, color: `${color}.main` }} />
                  </Box>
                  <Typography variant="subtitle2">{label}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
