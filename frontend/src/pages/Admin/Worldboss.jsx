import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import api from "../../services/api";
import useAlertDialog from "../../hooks/useAlertDialog";
import useHintBar from "../../hooks/useHintBar";
import AlertDialog from "../../components/AlertDialog";
import HintSnackBar from "../../components/HintSnackBar";

const emptyBoss = { name: "", hp_weight: "1", image: "", description: "" };
const emptySeason = { name: "", announcement: "", end_time: "" };

const toUtcIso = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const seasonPayload = form => ({
  name: form.name.trim(),
  announcement: form.announcement.trim() || null,
  end_time: toUtcIso(form.end_time),
});

const statusMeta = {
  draft: { label: "草稿", color: "default" },
  active: { label: "進行中", color: "success" },
  settled: { label: "已結算", color: "secondary" },
};

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-TW");
}

function errorMessage(error, fallback) {
  return error.response?.data?.error || error.response?.data?.message || fallback;
}

export default function Worldboss() {
  const [bosses, setBosses] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bossDialogOpen, setBossDialogOpen] = useState(false);
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [editingBoss, setEditingBoss] = useState(null);
  const [editingSeason, setEditingSeason] = useState(null);
  const [bossForm, setBossForm] = useState(emptyBoss);
  const [seasonForm, setSeasonForm] = useState(emptySeason);
  const [bossErrors, setBossErrors] = useState({});
  const [seasonErrors, setSeasonErrors] = useState({});
  const [savingBoss, setSavingBoss] = useState(false);
  const [savingSeason, setSavingSeason] = useState(false);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async (showLoading = true) => {
    const requestId = ++requestSequenceRef.current;
    const isCurrent = () => mountedRef.current && requestId === requestSequenceRef.current;

    if (showLoading && isCurrent()) setLoading(true);
    if (isCurrent()) setError(false);

    const [bossResult, seasonResult] = await Promise.allSettled([
      api.get("/api/admin/world-bosses"),
      api.get("/api/admin/world-boss-seasons"),
    ]);

    if (!isCurrent()) return null;

    if (bossResult.status === "fulfilled") setBosses(bossResult.value.data || []);
    if (seasonResult.status === "fulfilled") setSeasons(seasonResult.value.data || []);

    const failed = bossResult.status === "rejected" || seasonResult.status === "rejected";
    setError(failed);
    setLoading(false);
    return !failed;
  }, []);

  useEffect(() => {
    document.title = "世界王管理";
    mountedRef.current = true;
    const timer = window.setTimeout(() => {
      fetchData().then(loaded => {
        if (loaded === false) showHint("載入世界王資料失敗", "error");
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, [fetchData, showHint]);

  const refresh = async () => {
    setRefreshing(true);
    const loaded = await fetchData(false);
    if (!mountedRef.current) return;
    setRefreshing(false);
    if (loaded !== null) {
      showHint(loaded ? "資料已重新載入" : "部分資料載入失敗", loaded ? "success" : "error");
    }
  };

  const reloadAfterMutation = async () => {
    const loaded = await fetchData(false);
    if (loaded === false) showHint("操作已完成，但部分資料重新載入失敗", "warning");
    return loaded;
  };

  const openBossDialog = boss => {
    setEditingBoss(boss || null);
    setBossErrors({});
    setBossForm(
      boss
        ? {
            name: boss.name || "",
            hp_weight: String(boss.hp_weight ?? ""),
            image: boss.image || "",
            description: boss.description || "",
          }
        : emptyBoss
    );
    setBossDialogOpen(true);
  };

  const openSeasonDialog = season => {
    setEditingSeason(season || null);
    setSeasonErrors({});
    setSeasonForm(
      season
        ? {
            name: season.name || "",
            announcement: season.announcement || "",
            end_time: toLocalDateTime(season.end_time),
          }
        : emptySeason
    );
    setSeasonDialogOpen(true);
  };

  const saveBoss = async () => {
    const nextErrors = {};
    const name = bossForm.name.trim();
    const hpWeight = Number(bossForm.hp_weight);
    if (!name) nextErrors.name = "必填";
    else if (name.length > 64) nextErrors.name = "最多 64 字";
    if (!Number.isFinite(hpWeight) || hpWeight <= 0) nextErrors.hp_weight = "需為有限的正數";
    setBossErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = {
      name,
      hp_weight: hpWeight,
      image: bossForm.image.trim() || null,
      description: bossForm.description.trim() || null,
    };

    try {
      setSavingBoss(true);
      if (editingBoss) await api.put(`/api/admin/world-bosses/${editingBoss.id}`, payload);
      else await api.post("/api/admin/world-bosses", payload);
      setBossDialogOpen(false);
      const loaded = await reloadAfterMutation();
      if (loaded) showHint(editingBoss ? "世界王已更新" : "世界王已新增", "success");
    } catch (requestError) {
      showHint(errorMessage(requestError, "世界王操作失敗"), "error");
    } finally {
      setSavingBoss(false);
    }
  };

  const saveSeason = async () => {
    const nextErrors = {};
    const name = seasonForm.name.trim();
    const endTime = toUtcIso(seasonForm.end_time);
    if (!name) nextErrors.name = "必填";
    else if (name.length > 64) nextErrors.name = "最多 64 字";
    if (!endTime) nextErrors.end_time = "請輸入有效的結束時間";
    else if (new Date(endTime).getTime() <= Date.now()) nextErrors.end_time = "結束時間必須在未來";
    setSeasonErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      setSavingSeason(true);
      const payload = seasonPayload(seasonForm);
      if (editingSeason)
        await api.put(`/api/admin/world-boss-seasons/${editingSeason.id}`, payload);
      else await api.post("/api/admin/world-boss-seasons", payload);
      setSeasonDialogOpen(false);
      const loaded = await reloadAfterMutation();
      if (loaded) showHint(editingSeason ? "賽季草稿已更新" : "賽季草稿已新增", "success");
    } catch (requestError) {
      showHint(errorMessage(requestError, "賽季操作失敗"), "error");
    } finally {
      setSavingSeason(false);
    }
  };

  const confirmBossDelete = boss => {
    showAlert({
      title: "確認刪除世界王",
      description: `確定要刪除「${boss.name}」嗎？此操作無法復原。`,
      submitText: "刪除",
      cancelText: "取消",
      onSubmit: async () => {
        try {
          setConfirmationBusy(true);
          await api.delete(`/api/admin/world-bosses/${boss.id}`);
          closeAlert();
          const loaded = await reloadAfterMutation();
          if (loaded) showHint("世界王已刪除", "success");
        } catch (requestError) {
          showHint(errorMessage(requestError, "刪除世界王失敗"), "error");
        } finally {
          setConfirmationBusy(false);
        }
      },
    });
  };

  const confirmSeasonDelete = season => {
    showAlert({
      title: "確認刪除賽季草稿",
      description: `確定要刪除賽季「${season.name}」嗎？此操作無法復原。`,
      submitText: "刪除",
      cancelText: "取消",
      onSubmit: async () => {
        try {
          setConfirmationBusy(true);
          await api.delete(`/api/admin/world-boss-seasons/${season.id}`);
          closeAlert();
          const loaded = await reloadAfterMutation();
          if (loaded) showHint("賽季草稿已刪除", "success");
        } catch (requestError) {
          showHint(errorMessage(requestError, "刪除賽季草稿失敗"), "error");
        } finally {
          setConfirmationBusy(false);
        }
      },
    });
  };

  const confirmSeasonOpen = season => {
    showAlert({
      title: "確認開放賽季",
      description: `要立即開放賽季「${season.name}」嗎？賽季將以伺服器時間立即開始。`,
      submitText: "立即開放",
      cancelText: "取消",
      onSubmit: async () => {
        try {
          setConfirmationBusy(true);
          await api.post(`/api/admin/world-boss-seasons/${season.id}/open`);
          closeAlert();
          const loaded = await reloadAfterMutation();
          if (loaded) showHint("賽季已立即開放", "success");
        } catch (requestError) {
          showHint(errorMessage(requestError, "開放賽季失敗"), "error");
        } finally {
          setConfirmationBusy(false);
        }
      },
    });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: theme =>
              `linear-gradient(135deg, ${theme.palette.secondary.dark} 0%, ${theme.palette.primary.dark} 100%)`,
          }}
        />
        <Box
          sx={{
            position: "relative",
            p: { xs: 3, sm: 4 },
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <SportsEsportsIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
          <Box sx={{ color: "#fff", flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              世界王管理
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.85 }}>
              管理世界王圖鑑與賽季草稿；開放後由伺服器立即開始賽季。
            </Typography>
          </Box>
          <Tooltip title="重新載入">
            <span>
              <IconButton
                aria-label="重新載入"
                onClick={refresh}
                disabled={refreshing || loading}
                sx={{ color: "#fff", bgcolor: "rgba(255,255,255,0.16)" }}
              >
                {refreshing ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Paper>

      {error && <Alert severity="error">載入失敗，請重新載入後再試。</Alert>}

      <Paper sx={{ borderRadius: 3 }}>
        <Box
          sx={{
            px: { xs: 2.5, sm: 3 },
            py: 2,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              世界王圖鑑
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {bosses.length} 位世界王；已被賽季輪次使用的世界王無法刪除。
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openBossDialog()}>
            新增世界王
          </Button>
        </Box>
        <Divider />
        {loading ? (
          [0, 1].map(index => (
            <Box key={index} sx={{ p: 2.5 }}>
              <Skeleton variant="rounded" height={72} />
            </Box>
          ))
        ) : bosses.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <SportsEsportsIcon sx={{ fontSize: 44, opacity: 0.3 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              尚無世界王，請先建立圖鑑資料。
            </Typography>
          </Box>
        ) : (
          bosses.map((boss, index) => (
            <Box key={boss.id}>
              {index > 0 && <Divider />}
              <Box
                sx={{
                  px: { xs: 2.5, sm: 3 },
                  py: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <SportsEsportsIcon color="action" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>
                    {boss.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    HP 權重 {boss.hp_weight}
                    {boss.description ? ` · ${boss.description}` : ""}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <Tooltip title="編輯">
                    <IconButton
                      size="small"
                      aria-label={`編輯 ${boss.name}`}
                      onClick={() => openBossDialog(boss)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="刪除">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`刪除 ${boss.name}`}
                      onClick={() => confirmBossDelete(boss)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Box>
          ))
        )}
      </Paper>

      <Paper sx={{ borderRadius: 3 }}>
        <Box
          sx={{
            px: { xs: 2.5, sm: 3 },
            py: 2,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              世界王賽季
            </Typography>
            <Typography variant="body2" color="text.secondary">
              僅草稿可編輯、刪除或開放；進行中與已結算賽季為唯讀。
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openSeasonDialog()}>
            新增賽季
          </Button>
        </Box>
        <Divider />
        {loading ? (
          [0, 1].map(index => (
            <Box key={index} sx={{ p: 2.5 }}>
              <Skeleton variant="rounded" height={82} />
            </Box>
          ))
        ) : seasons.length === 0 ? (
          <Box sx={{ p: 5, textAlign: "center" }}>
            <Typography color="text.secondary">尚無賽季草稿。</Typography>
          </Box>
        ) : (
          seasons.map((season, index) => {
            const meta = statusMeta[season.status] || { label: season.status, color: "default" };
            const draft = season.status === "draft";
            return (
              <Box key={season.id}>
                {index > 0 && <Divider />}
                <Box
                  sx={{
                    px: { xs: 2.5, sm: 3 },
                    py: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 600 }}>{season.name}</Typography>
                      <Chip label={meta.label} size="small" color={meta.color} />
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mt: 0.5 }}
                    >
                      結束：{displayDate(season.end_time)}
                      {season.start_time ? ` · 開始：${displayDate(season.start_time)}` : ""}
                    </Typography>
                    {season.announcement && (
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
                        {season.announcement}
                      </Typography>
                    )}
                  </Box>
                  {draft && (
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Tooltip title="立即開放">
                        <IconButton
                          size="small"
                          color="success"
                          aria-label={`立即開放 ${season.name}`}
                          onClick={() => confirmSeasonOpen(season)}
                        >
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="編輯草稿">
                        <IconButton
                          size="small"
                          aria-label={`編輯 ${season.name}`}
                          onClick={() => openSeasonDialog(season)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="刪除草稿">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`刪除 ${season.name}`}
                          onClick={() => confirmSeasonDelete(season)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Paper>

      <Dialog
        open={bossDialogOpen}
        onClose={() => !savingBoss && setBossDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editingBoss ? "編輯世界王" : "新增世界王"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="名稱"
              value={bossForm.name}
              onChange={event => setBossForm(form => ({ ...form, name: event.target.value }))}
              error={!!bossErrors.name}
              helperText={bossErrors.name || "最多 64 字"}
              inputProps={{ maxLength: 64 }}
              fullWidth
              autoFocus
            />
            <TextField
              label="HP 權重"
              type="number"
              value={bossForm.hp_weight}
              onChange={event => setBossForm(form => ({ ...form, hp_weight: event.target.value }))}
              error={!!bossErrors.hp_weight}
              helperText={bossErrors.hp_weight || "必須是有限的正數"}
              inputProps={{ min: "0.001", step: "0.001" }}
              fullWidth
            />
            <TextField
              label="圖片網址"
              value={bossForm.image}
              onChange={event => setBossForm(form => ({ ...form, image: event.target.value }))}
              fullWidth
            />
            <TextField
              label="描述"
              value={bossForm.description}
              onChange={event =>
                setBossForm(form => ({ ...form, description: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBossDialogOpen(false)} disabled={savingBoss}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={saveBoss}
            disabled={savingBoss}
            startIcon={savingBoss ? <CircularProgress size={16} /> : null}
          >
            {editingBoss ? "儲存" : "新增"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={seasonDialogOpen}
        onClose={() => !savingSeason && setSeasonDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editingSeason ? "編輯賽季草稿" : "新增賽季草稿"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="賽季名稱"
              value={seasonForm.name}
              onChange={event => setSeasonForm(form => ({ ...form, name: event.target.value }))}
              error={!!seasonErrors.name}
              helperText={seasonErrors.name || "最多 64 字"}
              inputProps={{ maxLength: 64 }}
              fullWidth
              autoFocus
            />
            <TextField
              label="結束時間"
              type="datetime-local"
              value={seasonForm.end_time}
              onChange={event => setSeasonForm(form => ({ ...form, end_time: event.target.value }))}
              error={!!seasonErrors.end_time}
              helperText={seasonErrors.end_time || "會在送出時轉換為 UTC"}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="公告"
              value={seasonForm.announcement}
              onChange={event =>
                setSeasonForm(form => ({ ...form, announcement: event.target.value }))
              }
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeasonDialogOpen(false)} disabled={savingSeason}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={saveSeason}
            disabled={savingSeason}
            startIcon={savingSeason ? <CircularProgress size={16} /> : null}
          >
            {editingSeason ? "儲存" : "新增"}
          </Button>
        </DialogActions>
      </Dialog>

      <AlertDialog
        open={alertState.open}
        onClose={confirmationBusy ? undefined : closeAlert}
        onSubmit={alertState.onSubmit}
        onCancel={confirmationBusy ? undefined : closeAlert}
        title={alertState.title}
        description={alertState.description}
        submitText={alertState.submitText}
        cancelText={alertState.cancelText}
        disabled={confirmationBusy}
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
