import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Typography,
  Chip,
  IconButton,
  Stack,
  Paper,
  Tooltip,
  Divider,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CelebrationIcon from "@mui/icons-material/Celebration";
import { FullPageLoading } from "../../../components/Loading";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import * as gachaBannerService from "../../../services/gachaBanner";

const TYPE_CONFIG = {
  rate_up: { label: "機率提升", color: "warning" },
  europe: { label: "歐洲抽", color: "info" },
};

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-TW");
}

function getBannerStatus(banner) {
  if (!banner.is_active) return { label: "已停用", color: "default" };
  const now = new Date();
  if (new Date(banner.start_at) > now) return { label: "待開始", color: "info" };
  if (new Date(banner.end_at) < now) return { label: "已結束", color: "default" };
  return { label: "進行中", color: "success" };
}

export default function AdminGachaBanner() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gachaBannerService.fetchBanners();
      setRows(data);
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "轉蛋活動管理";
    fetchData();
  }, [fetchData]);

  const handleDeleteClick = row => {
    showAlert({
      title: "確認刪除",
      description: `確定要刪除活動「${row.name}」嗎？`,
      onSubmit: async () => {
        try {
          await gachaBannerService.deleteBanner(row.id);
          showHint("刪除成功", "success");
          fetchData();
        } catch {
          showHint("刪除失敗", "error");
        } finally {
          closeAlert();
        }
      },
    });
  };

  if (loading && rows.length === 0) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
          background: isDark
            ? "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(168,85,247,0.06) 100%)"
            : "linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(168,85,247,0.04) 100%)",
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              轉蛋活動管理
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              共 {rows.length} 個活動
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/admin/gacha-banner/new")}
            sx={{ borderRadius: 2, px: 2.5, boxShadow: 2 }}
          >
            新增活動
          </Button>
        </Stack>
      </Paper>

      {/* Banner List */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: "divider" }}>
        {rows.length === 0 && (
          <Box
            sx={{
              py: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <CelebrationIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography variant="body1" color="text.secondary">
              尚無活動資料
            </Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => navigate("/admin/gacha-banner/new")}
            >
              新增第一個活動
            </Button>
          </Box>
        )}
        {rows.map((banner, index) => {
          const status = getBannerStatus(banner);
          return (
            <Box key={banner.id}>
              {index > 0 && <Divider />}
              <Box
                sx={{
                  px: { xs: 2.5, sm: 3 },
                  py: { xs: 2, sm: 2.5 },
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <CelebrationIcon
                  sx={{
                    fontSize: 32,
                    color: status.color === "success" ? "warning.main" : "text.disabled",
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    sx={{ mb: 0.5 }}
                  >
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {banner.name}
                    </Typography>
                    <Chip
                      label={TYPE_CONFIG[banner.type]?.label || banner.type}
                      color={TYPE_CONFIG[banner.type]?.color || "default"}
                      size="small"
                    />
                    <Chip
                      label={status.label}
                      color={status.color}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(banner.start_at)} ～ {formatDateTime(banner.end_at)}
                  </Typography>
                  {banner.type === "rate_up" && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      機率加成: {banner.rate_boost}%
                    </Typography>
                  )}
                  {banner.type === "europe" && banner.cost > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      花費: {banner.cost} 女神石
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title="編輯" arrow>
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/admin/gacha-banner/${banner.id}/edit`)}
                      sx={{
                        color: "primary.main",
                        transition: "all 0.2s",
                        "&:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="刪除" arrow>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClick(banner)}
                      sx={{
                        color: "error.main",
                        transition: "all 0.2s",
                        "&:hover": { bgcolor: "error.main", color: "error.contrastText" },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            </Box>
          );
        })}
      </Paper>

      <AlertDialog
        open={alertState.open}
        onClose={closeAlert}
        onSubmit={alertState.onSubmit}
        onCancel={closeAlert}
        title={alertState.title}
        description={alertState.description}
      />
      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
