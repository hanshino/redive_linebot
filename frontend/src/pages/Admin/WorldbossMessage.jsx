import { useEffect } from "react";
import useAxios from "axios-hooks";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Alert,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { Link, useNavigate } from "react-router-dom";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

function ControlButtons({ onDeleteComplete, value }) {
  const navigate = useNavigate();
  const [{ data = {}, loading }, doDelete] = useAxios(
    {
      url: `/api/game/world-boss/feature-messages/${value}`,
      method: "DELETE",
    },
    { manual: true }
  );

  const handleDelete = () => {
    doDelete();
  };

  useEffect(() => {
    if (data.message === "success") {
      onDeleteComplete();
    }
  }, [data]);

  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      <Tooltip title="編輯" arrow>
        <IconButton
          size="small"
          disabled={loading}
          onClick={() => navigate(`/admin/worldboss-message/update/${value}`)}
          sx={{
            color: "primary.main",
            "&:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
            transition: "all 0.15s",
          }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="刪除" arrow>
        <IconButton
          size="small"
          disabled={loading}
          onClick={handleDelete}
          sx={{
            color: "error.main",
            "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
            transition: "all 0.15s",
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function DataList() {
  const [{ data = {}, error, loading }, refetch] = useAxios(
    "/api/game/world-boss/feature-messages"
  );
  const { data: messageData = [] } = data;

  useEffect(() => {
    refetch();
  }, [window.location.pathname]);

  if (loading) {
    return (
      <Paper sx={{ borderRadius: 3 }}>
        {[1, 2, 3].map(i => (
          <Box key={i} sx={{ px: { xs: 2.5, sm: 3 }, py: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="rounded" width="60%" height={20} />
              </Box>
              <Skeleton variant="rounded" width={80} height={32} />
            </Box>
          </Box>
        ))}
      </Paper>
    );
  }

  if (error) {
    return <Alert severity="error">發生錯誤，請確認是否有管理權限！</Alert>;
  }

  if (messageData.length === 0) {
    return (
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: 4, textAlign: "center" }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          尚無訊息樣板，點擊右上角「新增」按鈕新增
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ borderRadius: 3 }}>
      {messageData.map((row, index) => (
        <Box key={row.id}>
          <Box
            sx={{
              px: { xs: 2.5, sm: 3 },
              py: 2,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Avatar alt="頭像" src={row.icon_url} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                {row.template}
              </Typography>
            </Box>
            <ControlButtons value={row.id} onDeleteComplete={refetch} />
          </Box>
          {index < messageData.length - 1 && <Divider />}
        </Box>
      ))}
    </Paper>
  );
}

export default function AdminWorldbossMessage() {
  const { loggedIn } = useLiff();

  useEffect(() => {
    document.title = "管理員用－世界王訊息管理";
  }, []);

  if (!loggedIn) {
    return <AlertLogin />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Gradient Banner */}
      <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: theme =>
              `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          }}
        />
        <Box
          sx={{
            position: "relative",
            p: { xs: 3, sm: 4 },
            display: "flex",
            alignItems: "center",
            gap: 2.5,
          }}
        >
          <FitnessCenterIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
          <Box sx={{ flex: 1, color: "#fff", minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              世界王訊息管理
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.8)" }}>
                所有紀錄都會記錄作者資訊，請謹慎操作
              </Typography>
            </Box>
          </Box>
          <Button
            component={Link}
            to="/admin/worldboss-message/create"
            variant="contained"
            startIcon={<AddIcon />}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            新增
          </Button>
        </Box>
      </Paper>

      <DataList />
    </Box>
  );
}
