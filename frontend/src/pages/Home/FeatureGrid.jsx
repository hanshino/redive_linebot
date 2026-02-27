import { useNavigate } from "react-router-dom";
import { Grid, Card, CardActionArea, CardContent, Box, Typography } from "@mui/material";
import HowToVoteIcon from "@mui/icons-material/HowToVote";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import GroupIcon from "@mui/icons-material/Group";
import LocalLibraryIcon from "@mui/icons-material/LocalLibrary";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import StorefrontIcon from "@mui/icons-material/Storefront";
import CasinoIcon from "@mui/icons-material/Casino";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";

const features = [
  { icon: HowToVoteIcon, label: "專屬指令", description: "自訂群組指令", path: null, color: "#6C63FF" },
  { icon: RecordVoiceOverIcon, label: "幹話等級", description: "聊天經驗排行", path: "/rankings", color: "#FFB830" },
  { icon: GroupIcon, label: "公會管理", description: "群組設定管理", path: null, color: "#51CF66" },
  { icon: LocalLibraryIcon, label: "遊戲查詢", description: "角色與裝備資訊", path: null, color: "#74C0FC" },
  { icon: EmojiEventsIcon, label: "公會戰", description: "報刀與戰績", path: null, color: "#FF6B6B" },
  { icon: StorefrontIcon, label: "轉蛋商店", description: "女神石兌換", path: "/gacha/exchange", color: "#E599F7" },
  { icon: CasinoIcon, label: "刮刮卡", description: "試試手氣", path: "/scratch-card", color: "#FFB830" },
  { icon: FitnessCenterIcon, label: "裝備管理", description: "查看我的裝備", path: "/equipment", color: "#FF6B6B" },
];

export default function FeatureGrid() {
  const navigate = useNavigate();

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        功能一覽
      </Typography>
      <Grid container spacing={2}>
        {features.map(({ icon: Icon, label, description, path, color }) => (
          <Grid size={{ xs: 6, sm: 4, md: 3 }} key={label}>
            <Card
              sx={{
                height: "100%",
                transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out, transform 0.2s ease-out",
                "&:hover": {
                  transform: "translateY(-2px)",
                },
              }}
            >
              <CardActionArea
                onClick={() => path && navigate(path)}
                disabled={!path}
                sx={{ height: "100%", p: 2 }}
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
                      bgcolor: `${color}15`,
                      mb: 1.5,
                    }}
                  >
                    <Icon sx={{ fontSize: 32, color }} />
                  </Box>
                  <Typography variant="subtitle2" gutterBottom>
                    {label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
