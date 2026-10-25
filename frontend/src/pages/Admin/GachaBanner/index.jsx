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
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CelebrationIcon from "@mui/icons-material/Celebration";
import { FullPageLoading } from "../../../components/Loading";
import LoadError from "../../../components/LoadError";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import * as gachaBannerService from "../../../services/gachaBanner";
import { errorText } from "../_errors";

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

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert, setBusy }] =
    useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await gachaBannerService.fetchBanners();
      setRows(data);
    } catch {
      // 失敗不能顯示成「尚無活動資料」，清掉列表並改顯示 LoadError
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "轉蛋活動管理";
    fetchData();
  }, [fetchData]);

  const handleDeleteClick = row => {
    const live = getBannerStatus(row).label === "進行中";
    showAlert({
      title: "刪除轉蛋活動",
      description: `「${row.name}」${live ? "正在進行中，刪除後會立即結束，" : ""}無法復原。`,
      submitText: "刪除",
      destructive: true,
      onSubmit: async () => {
        setBusy(true);
        try {
          await gachaBannerService.deleteBanner(row.id);
          closeAlert();
          showHint(`已刪除活動「${row.name}」`, "success");
          fetchData();
        } catch (e) {
          // 失敗時保留確認框，讓管理員可以重試或取消
          setBusy(false);
          showHint(errorText(e, `刪除「${row.name}」失敗，活動還在，請稍後再試。`), "error");
        }
      },
    });
  };

  if (error) {
    return <LoadError message="轉蛋活動載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />;
  }

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
          background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.light, 0.07)} 0%, ${alpha(theme.palette.rarity[1].main, 0.05)} 100%)`,
        }}
      >
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
          }}
        >
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
            sx={{ borderRadius: 2, px: 2.5, minHeight: 44, flexShrink: 0 }}
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
            <Typography
              variant="body1"
              sx={{
                color: "text.secondary",
              }}
            >
              尚無活動資料
            </Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => navigate("/admin/gacha-banner/new")}
              sx={{ minHeight: 44 }}
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
                    sx={{
                      alignItems: "center",
                      flexWrap: "wrap",
                      mb: 0.5,
                    }}
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
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                    }}
                  >
                    {formatDateTime(banner.start_at)} ～ {formatDateTime(banner.end_at)}
                  </Typography>
                  {banner.type === "rate_up" && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        display: "block",
                      }}
                    >
                      機率加成：{banner.rate_boost}%
                    </Typography>
                  )}
                  {banner.type === "europe" && banner.cost > 0 && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        display: "block",
                      }}
                    >
                      花費：{banner.cost} 女神石
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1}>
                  <Tooltip title="編輯" arrow>
                    <IconButton
                      aria-label={`編輯活動 ${banner.name}`}
                      onClick={() => navigate(`/admin/gacha-banner/${banner.id}/edit`)}
                      sx={{
                        width: 44,
                        height: 44,
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
                      aria-label={`刪除活動 ${banner.name}`}
                      onClick={() => handleDeleteClick(banner)}
                      sx={{
                        width: 44,
                        height: 44,
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
        submitText={alertState.submitText}
        destructive={alertState.destructive}
        busy={alertState.busy}
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
