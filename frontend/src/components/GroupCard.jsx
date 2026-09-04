import { useNavigate } from "react-router-dom";
import {
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
  Stack,
  Avatar,
  Chip,
} from "@mui/material";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldIcon from "@mui/icons-material/Shield";
import CodeIcon from "@mui/icons-material/Code";
import PeopleIcon from "@mui/icons-material/People";

const actions = [
  { label: "聊天數據", icon: BarChartIcon, path: id => `/group/${id}/record` },
  { label: "群組設定", icon: SettingsIcon, path: id => `/group/${id}/config` },
  { label: "戰隊管理", icon: ShieldIcon, path: id => `/group/${id}/battle` },
  { label: "自訂指令", icon: CodeIcon, path: id => `/source/${id}/customer/orders` },
];

// 群組圖是使用者上傳的，比例不固定，統一裁成 16:9 才不會忽高忽低
export const MEDIA_ASPECT_RATIO = "16 / 9";

export default function GroupCard({ groupId, groupName, pictureUrl, count }) {
  const navigate = useNavigate();
  const initial = groupName?.charAt(0) || "?";

  return (
    <Card variant="outlined" sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {pictureUrl ? (
        <CardMedia
          component="img"
          image={pictureUrl}
          alt={groupName}
          loading="lazy"
          sx={{ aspectRatio: MEDIA_ASPECT_RATIO, objectFit: "cover" }}
        />
      ) : (
        <Box
          sx={{
            aspectRatio: MEDIA_ASPECT_RATIO,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: theme =>
              `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          }}
        >
          <Avatar
            sx={{
              width: 64,
              height: 64,
              fontSize: 28,
              fontWeight: 700,
              bgcolor: "rgba(255,255,255,0.2)",
              color: "primary.contrastText",
            }}
          >
            {initial}
          </Avatar>
        </Box>
      )}

      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, pb: 1 }}>
        <Stack spacing={0.75} sx={{ alignItems: "flex-start" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, width: "100%" }} noWrap>
            {groupName}
          </Typography>
          {count != null && (
            <Chip
              size="small"
              variant="outlined"
              icon={<PeopleIcon />}
              label={`${count} 人`}
              sx={{ color: "text.secondary" }}
            />
          )}
        </Stack>
      </CardContent>

      {/* 固定兩欄，卡片變寬變窄都不會重排 */}
      <CardActions
        disableSpacing
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 1,
          px: { xs: 2, sm: 2.5 },
          pb: { xs: 2, sm: 2.5 },
          mt: "auto",
        }}
      >
        {actions.map(({ label, icon: Icon, path }) => (
          <Button
            key={label}
            size="small"
            variant="outlined"
            startIcon={<Icon />}
            onClick={() => navigate(path(groupId))}
            sx={{ minHeight: 36, justifyContent: "flex-start" }}
          >
            {label}
          </Button>
        ))}
      </CardActions>
    </Card>
  );
}
