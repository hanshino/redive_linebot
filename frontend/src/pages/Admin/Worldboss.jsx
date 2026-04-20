import { useEffect, useState, useRef } from "react";
import useAxios from "axios-hooks";
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Button,
  Avatar,
  Chip,
  Divider,
  Skeleton,
  Alert,
  AlertTitle,
  Tooltip,
  Stack,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ImageIcon from "@mui/icons-material/Image";
import PetsIcon from "@mui/icons-material/Pets";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import get from "lodash/get";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import AlertDialog from "../../components/AlertDialog";
import useAlertDialog from "../../hooks/useAlertDialog";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

function DataForm({ id, onSubmit, onCancel, submitting }) {
  const nameEl = useRef(null);
  const levelEl = useRef(null);
  const hpEl = useRef(null);
  const expEl = useRef(null);
  const goldEl = useRef(null);
  const descEl = useRef(null);
  const [{ data = {}, loading }, fetchData] = useAxios(`/api/admin/world-bosses/${id}`, {
    manual: true,
  });
  const [image, setImage] = useState(null);
  const [{ data: uploadResult = {}, loading: uploading }, doUpload] = useAxios(
    { url: "/api/images", method: "POST" },
    { manual: true }
  );

  useEffect(() => {
    if (!id) return;
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!uploadResult.success || uploading) return;
    setImage(uploadResult.link);
  }, [uploadResult, uploading]);

  useEffect(() => {
    const dataImg = get(data, "image");
    if (dataImg) {
      setImage(dataImg);
    }
  }, [data]);

  const { name, level, hp, exp, gold, description } = data;

  const handleSubmit = () => {
    onSubmit({
      id,
      name: nameEl.current.value,
      description: descEl.current.value,
      level: parseInt(levelEl.current.value),
      hp: parseInt(hpEl.current.value),
      exp: parseInt(expEl.current.value),
      gold: parseInt(goldEl.current.value),
      image,
    });
  };

  const handleUploadImage = event => {
    const file = get(event, "target.files[0]");
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = /^data:image\/(png|jpg|jpeg);base64,(.+)/.exec(reader.result);
      const base = get(result, "[2]");
      if (base) {
        doUpload({
          data: { image: base },
          timeout: 60 * 1000,
        });
      }
    };
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton onClick={onCancel}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {id ? "世界王資料" : "新增世界王"}
        </Typography>
      </Box>

      {/* Warning Alert */}
      <Alert severity="warning">
        <AlertTitle>注意！</AlertTitle>
        <strong>經驗與女神石</strong>
        設定需配合血量比例，建議比例為 1血量:1經驗，女神石則視情況而定
      </Alert>

      {/* Image Preview Card */}
      <Paper
        elevation={0}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
        }}
      >
        {loading ? (
          <Skeleton variant="circular" width={120} height={120} />
        ) : image ? (
          <Avatar src={image} alt="世界王圖片" sx={{ width: 120, height: 120 }} />
        ) : (
          <Box
            sx={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              border: 2,
              borderStyle: "dashed",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(0,0,0,0.02)",
            }}
          >
            <BrokenImageIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          </Box>
        )}
        {loading ? (
          <Skeleton variant="text" width={100} sx={{ mt: 1.5 }} />
        ) : (
          name && (
            <Typography variant="h6" sx={{ mt: 1.5, fontWeight: 600 }}>
              {name}
            </Typography>
          )
        )}
      </Paper>

      {/* Form Card */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
        }}
      >
        {loading ? (
          <Stack spacing={2.5}>
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={80} />
            <Skeleton variant="rounded" height={56} />
            <Skeleton variant="rounded" height={56} />
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700 }}>
              基本資訊
            </Typography>

            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                variant="outlined"
                label="名稱"
                defaultValue={name}
                inputRef={nameEl}
              />
              <TextField
                fullWidth
                variant="outlined"
                label="等級"
                defaultValue={level}
                inputRef={levelEl}
              />
            </Stack>

            <TextField
              fullWidth
              multiline
              variant="outlined"
              label="王的個人資料"
              defaultValue={description}
              inputRef={descEl}
            />

            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700 }}>
              數值設定
            </Typography>

            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                variant="outlined"
                label="血量"
                defaultValue={hp}
                inputRef={hpEl}
              />
              <TextField
                fullWidth
                variant="outlined"
                label="經驗"
                defaultValue={exp}
                inputRef={expEl}
              />
            </Stack>

            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                variant="outlined"
                label="女神石"
                defaultValue={gold}
                inputRef={goldEl}
              />
              <TextField
                fullWidth
                label="圖片"
                variant="outlined"
                value={image || ""}
                onChange={event => setImage(event.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <IconButton component="label">
                        <input type="file" hidden accept="image/*" onChange={handleUploadImage} />
                        <ImageIcon />
                      </IconButton>
                    ),
                  },
                }}
              />
            </Stack>

            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button variant="outlined" onClick={onCancel} disabled={submitting || uploading}>
                取消
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={submitting || uploading}
              >
                {submitting ? "儲存中..." : "儲存"}
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

function BossListSkeleton() {
  return (
    <Paper sx={{ borderRadius: 3 }}>
      {[0, 1, 2].map(i => (
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
              <Skeleton variant="rounded" width="40%" height={20} sx={{ mb: 0.5 }} />
              <Skeleton variant="rounded" width="70%" height={16} />
            </Box>
            <Skeleton variant="rounded" width={64} height={32} />
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

export default function AdminWorldboss() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [dialogState, { handleOpen: openDialog, handleClose: closeDialog }] = useAlertDialog();
  const [{ data = [], loading }, fetchData] = useAxios("/api/admin/world-bosses", { manual: true });
  const [{ data: updateData, loading: updateLoading, error: updatedError }, updateDataRequest] =
    useAxios({ method: "PUT" }, { manual: true });
  const [{ data: createdData, loading: createdLoading }, createDataRequest] = useAxios(
    { method: "POST" },
    { manual: true }
  );
  const [{ data: deletedData, loading: deletedLoading, error: deletedError }, deleteDataRequest] =
    useAxios({ method: "DELETE" }, { manual: true });
  const [editState, setEditState] = useState({ id: null, isActive: false });
  const [hintState, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "世界王列表";
  }, []);

  useEffect(() => {
    if (createdLoading) return;
    if (createdData) {
      handleOpen("新增成功", "success");
      setEditState({ id: null, isActive: false });
      fetchData();
    }
  }, [createdLoading, createdData]);

  useEffect(() => {
    if (updateLoading) return;
    if (updateData) {
      handleOpen("更新成功", "success");
      setEditState({ id: null, isActive: false });
      fetchData();
    } else if (updatedError) {
      handleOpen("更新失敗", "error");
    }
  }, [updateLoading, updateData]);

  useEffect(() => {
    if (deletedLoading) return;
    if (deletedData) {
      handleOpen("刪除成功", "success");
      fetchData();
    } else if (deletedError) {
      handleOpen("刪除失敗", "error");
    }
  }, [deletedLoading, deletedData]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn]);

  const handleSubmit = formData => {
    const id = get(formData, "id");
    if (id) {
      updateDataRequest({
        url: `/api/admin/world-bosses/${id}`,
        data: formData,
      });
    } else {
      createDataRequest({
        url: `/api/admin/world-bosses`,
        data: formData,
      });
    }
  };

  const handleCancel = () => {
    setEditState({ id: null, isActive: false });
  };

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (editState.isActive) {
    return (
      <>
        <DataForm
          id={editState.id}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitting={updateLoading || createdLoading}
        />
        <HintSnackBar
          open={hintState.open}
          message={hintState.message}
          severity={hintState.severity}
          onClose={handleClose}
        />
      </>
    );
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
            flexWrap: "wrap",
          }}
        >
          <PetsIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
          <Box sx={{ color: "#fff", minWidth: 0, flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              世界王列表
            </Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
              <Chip
                label={`${data.length} 隻世界王`}
                size="small"
                sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
              />
            </Box>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditState({ id: null, isActive: true })}
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "#fff",
              "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
              backdropFilter: "blur(4px)",
            }}
          >
            新增世界王
          </Button>
        </Box>
      </Paper>
      {/* Boss List */}
      {loading ? (
        <BossListSkeleton />
      ) : (
        <Paper sx={{ borderRadius: 3 }}>
          {data.length === 0 && (
            <Box sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                }}
              >
                尚無世界王資料
              </Typography>
            </Box>
          )}
          {data.map((boss, index) => (
            <Box key={boss.id}>
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
                <Avatar
                  src={boss.image}
                  alt={boss.name}
                  sx={{ width: 44, height: 44, bgcolor: "primary.light" }}
                >
                  <PetsIcon />
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {boss.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                    }}
                  >
                    Lv.{boss.level} &nbsp;|&nbsp; HP {boss.hp?.toLocaleString()} &nbsp;|&nbsp; EXP{" "}
                    {boss.exp?.toLocaleString()} &nbsp;|&nbsp; 女神石 {boss.gold?.toLocaleString()}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <Tooltip title="編輯">
                    <IconButton
                      size="small"
                      onClick={() => setEditState({ id: boss.id, isActive: true })}
                      sx={{ color: "primary.main" }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="刪除">
                    <IconButton
                      size="small"
                      onClick={() =>
                        openDialog({
                          title: "刪除此世界王",
                          description: "刪除之後，將會連帶影響活動中的世界王，確定要刪除嗎？",
                          submitText: "刪除",
                          cancelText: "取消",
                          onCancel: () => closeDialog(),
                          onSubmit: () => {
                            deleteDataRequest({
                              url: `/api/admin/world-bosses/${boss.id}`,
                            });
                            closeDialog();
                          },
                        })
                      }
                      sx={{ color: "error.main" }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
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
      <AlertDialog
        open={dialogState.open}
        onClose={closeDialog}
        title={dialogState.title}
        description={dialogState.description}
        submitText={dialogState.submitText}
        cancelText={dialogState.cancelText}
        onSubmit={dialogState.onSubmit}
        onCancel={dialogState.onCancel}
      />
    </Box>
  );
}
