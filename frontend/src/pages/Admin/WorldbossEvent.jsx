import { useEffect, useState, useRef } from "react";
import useAxios from "axios-hooks";
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Tooltip,
  Grid,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EventIcon from "@mui/icons-material/Event";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

function EditDialog({ open, onClose, onSubmit, loading: parentLoading }) {
  const [{ data: bossData = [], loading }] = useAxios("/api/admin/world-bosses");
  const bossEl = useRef(null);
  const announceEl = useRef(null);
  const startTimeEl = useRef(null);
  const endTimeEl = useRef(null);

  const handleSubmit = () => {
    const startAt = startTimeEl.current.value;
    const endAt = endTimeEl.current.value;

    if (startAt >= endAt) {
      alert("請確認活動時間");
      return;
    }

    onSubmit({
      world_boss_id: parseInt(bossEl.current.value),
      announcement: announceEl.current.value,
      start_time: startAt,
      end_time: endAt,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>新增世界王活動</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {loading ? (
            <>
              <Skeleton variant="rounded" height={56} />
              <Skeleton variant="rounded" height={80} />
              <Box sx={{ display: "flex", gap: 2 }}>
                <Skeleton variant="rounded" height={56} sx={{ flex: 1 }} />
                <Skeleton variant="rounded" height={56} sx={{ flex: 1 }} />
              </Box>
            </>
          ) : (
            <>
              <TextField
                select
                label="世界王"
                fullWidth
                defaultValue={bossData[0]?.id ?? ""}
                inputRef={bossEl}
                helperText="請選擇世界王來綁定活動，若無世界王，請先去新增世界王"
              >
                {bossData.map((boss) => (
                  <MenuItem key={boss.id} value={boss.id}>
                    {boss.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="活動公告"
                multiline
                fullWidth
                inputRef={announceEl}
              />
              <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                  label="開始時間"
                  type="datetime-local"
                  fullWidth
                  required
                  inputRef={startTimeEl}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="結束時間"
                  type="datetime-local"
                  fullWidth
                  required
                  inputRef={endTimeEl}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">
          取消
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={parentLoading}
        >
          新增
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EventListSkeleton() {
  return (
    <Paper sx={{ borderRadius: 3 }}>
      {[0, 1, 2].map((i) => (
        <Box key={i}>
          {i > 0 && <Divider />}
          <Box
            sx={{
              px: { xs: 2.5, sm: 3 },
              py: { xs: 2, sm: 2.5 },
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Skeleton variant="rounded" width={40} height={40} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="rounded" width="35%" height={20} sx={{ mb: 0.5 }} />
              <Skeleton variant="rounded" width="65%" height={16} />
            </Box>
            <Skeleton variant="rounded" width={36} height={36} />
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-TW");
}

export default function AdminWorldbossEvent() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [hintState, { handleOpen, handleClose }] = useHintBar();
  const [{ data, loading, error }, fetchData] = useAxios(
    "/api/admin/world-boss-events",
    { manual: true }
  );
  const [
    { data: createdResponse, loading: createdLoading, error: createdError },
    createData,
  ] = useAxios(
    { url: "/api/admin/world-boss-events", method: "POST" },
    { manual: true }
  );
  const [
    { data: deletedResponse, loading: deletedLoading, error: deletedError },
    deleteData,
  ] = useAxios({ method: "DELETE" }, { manual: true });

  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    document.title = "世界王活動";
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (error) {
      handleOpen(error.message, "error");
    }
  }, [error]);

  useEffect(() => {
    if (createdLoading) return;
    if (createdError) {
      handleOpen(createdError.message, "error");
    } else if (createdResponse) {
      setDialogOpen(false);
      handleOpen("新增成功", "success");
      fetchData();
    }
  }, [createdResponse]);

  useEffect(() => {
    if (deletedLoading) return;
    if (deletedError) {
      handleOpen(deletedError.message, "error");
    } else if (deletedResponse) {
      handleOpen("刪除成功", "success");
      fetchData();
    }
  }, [deletedResponse]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const events = data || [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Gradient Banner */}
      <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: (theme) =>
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
            flexWrap: "wrap",
          }}
        >
          <EventIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
          <Box sx={{ color: "#fff", minWidth: 0, flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              世界王活動
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`${events.length} 個活動`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
              backdropFilter: "blur(4px)",
            }}
          >
            新增活動
          </Button>
        </Box>
      </Paper>

      {/* Event List */}
      {loading ? (
        <EventListSkeleton />
      ) : (
        <Paper sx={{ borderRadius: 3 }}>
          {events.length === 0 && (
            <Box sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
              <Typography variant="body2" color="text.secondary">
                尚無活動資料
              </Typography>
            </Box>
          )}
          {events.map((event, index) => (
            <Box key={event.id}>
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
                <Avatar sx={{ bgcolor: "primary.light", width: 44, height: 44 }}>
                  <EventIcon />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Boss #{event.world_boss_id}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.25 }}
                  >
                    {event.announcement || "（無公告）"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(event.start_time)} ～ {formatDateTime(event.end_time)}
                  </Typography>
                </Box>
                <Tooltip title="刪除">
                  <IconButton
                    size="small"
                    onClick={() =>
                      deleteData({
                        url: `/api/admin/world-boss-events/${event.id}`,
                      })
                    }
                    sx={{ color: "error.main" }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ))}
        </Paper>
      )}

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={handleClose}
      />
      <EditDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(formData) => createData({ data: formData })}
        loading={createdLoading}
      />
    </Box>
  );
}
