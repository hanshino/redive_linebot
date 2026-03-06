import { useNavigate } from "react-router-dom";
import {
  Card, CardMedia, CardContent, CardActions,
  Typography, Button, Box, Avatar,
} from "@mui/material";
import BarChartIcon from "@mui/icons-material/BarChart";
import SettingsIcon from "@mui/icons-material/Settings";
import ShieldIcon from "@mui/icons-material/Shield";
import CodeIcon from "@mui/icons-material/Code";
import PeopleIcon from "@mui/icons-material/People";

const actions = [
  { label: "聊天數據", icon: BarChartIcon, path: (id) => `/group/${id}/record` },
  { label: "群組設定", icon: SettingsIcon, path: (id) => `/group/${id}/config` },
  { label: "戰隊管理", icon: ShieldIcon, path: (id) => `/group/${id}/battle` },
  { label: "自訂指令", icon: CodeIcon, path: (id) => `/source/${id}/customer/orders` },
];

export default function GroupCard({ groupId, groupName, pictureUrl, count }) {
  const navigate = useNavigate();
  const initial = groupName?.charAt(0) || "?";

  return (
    <Card sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {pictureUrl ? (
        <CardMedia
          component="img"
          height="140"
          image={pictureUrl}
          alt={groupName}
          loading="lazy"
          sx={{ objectFit: "cover" }}
        />
      ) : (
        <Box
          sx={{
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: (theme) =>
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

      <CardContent sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
          {groupName}
        </Typography>
        {count != null && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
            <PeopleIcon sx={{ fontSize: 16 }} color="action" />
            <Typography variant="caption" color="text.secondary">
              {count} 人
            </Typography>
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ flexWrap: "wrap", gap: 0.5, px: 2, pb: 2, mt: "auto" }}>
        {actions.map(({ label, icon: Icon, path }) => (
          <Button
            key={label}
            size="small"
            variant="outlined"
            startIcon={<Icon />}
            onClick={() => navigate(path(groupId))}
            sx={{ textTransform: "none", cursor: "pointer", minHeight: 36 }}
          >
            {label}
          </Button>
        ))}
      </CardActions>
    </Card>
  );
}
