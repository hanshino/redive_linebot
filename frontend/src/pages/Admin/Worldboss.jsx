import { useEffect, useState, useRef } from "react";
import useAxios from "axios-hooks";
import { DataGrid } from "@mui/x-data-grid";
import {
  Grid,
  Paper,
  Typography,
  TextField,
  IconButton,
  Button,
  Fab,
  Alert,
  AlertTitle,
  LinearProgress,
} from "@mui/material";
import { green, red } from "@mui/material/colors";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ImageIcon from "@mui/icons-material/Image";
import get from "lodash/get";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import AlertDialog from "../../components/AlertDialog";
import useAlertDialog from "../../hooks/useAlertDialog";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

function CustomLoadingOverlay() {
  return (
    <LinearProgress
      color="secondary"
      sx={{ position: "absolute", top: 0, width: "100%" }}
    />
  );
}

function DataForm({ id, onSubmit, onCancel, submitting }) {
  const nameEl = useRef(null);
  const levelEl = useRef(null);
  const hpEl = useRef(null);
  const expEl = useRef(null);
  const goldEl = useRef(null);
  const descEl = useRef(null);
  const [{ data = {}, loading }, fetchData] = useAxios(
    `/api/admin/world-bosses/${id}`,
    { manual: true }
  );
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

  if (loading) return <FullPageLoading />;

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

  const handleUploadImage = (event) => {
    const file = get(event, "target.files[0]");
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = /^data:image\/(png|jpg|jpeg);base64,(.+)/.exec(
        reader.result
      );
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
    <Grid container direction="column">
      {(submitting || uploading) && <FullPageLoading />}
      <Grid size={{ xs: 12 }}>
        <Typography variant="h5" sx={{ mb: "5px" }}>
          世界王資料
        </Typography>
      </Grid>
      <Grid>
        <Alert severity="warning">
          <AlertTitle>注意！</AlertTitle>
          <strong>經驗與女神石</strong>
          設定需配合血量比例，建議比例為 1血量:1經驗，女神石則視情況而定
        </Alert>
      </Grid>
      <Grid
        container
        size={{ xs: 12 }}
        component={Paper}
        sx={{ p: 2 }}
        direction="column"
        alignItems="center"
      >
        {image && (
          <Grid>
            <img
              src={image}
              alt="世界王圖片"
              style={{ width: "100%", maxWidth: "200px" }}
            />
          </Grid>
        )}
        <Grid container spacing={1}>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="名稱"
              defaultValue={name}
              margin="normal"
              inputRef={nameEl}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="等級"
              defaultValue={level}
              margin="normal"
              inputRef={levelEl}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              multiline
              variant="outlined"
              label="王的個人資料"
              defaultValue={description}
              margin="normal"
              inputRef={descEl}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="血量"
              defaultValue={hp}
              margin="normal"
              inputRef={hpEl}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="經驗"
              defaultValue={exp}
              margin="normal"
              inputRef={expEl}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="女神石"
              defaultValue={gold}
              margin="normal"
              inputRef={goldEl}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="圖片"
              variant="outlined"
              margin="normal"
              value={image || ""}
              onChange={(event) => setImage(event.target.value)}
              slotProps={{
                input: {
                  endAdornment: (
                    <IconButton component="label">
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleUploadImage}
                      />
                      <ImageIcon />
                    </IconButton>
                  ),
                },
              }}
            />
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <Button
              fullWidth
              variant="contained"
              color="secondary"
              onClick={onCancel}
            >
              取消
            </Button>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleSubmit}
            >
              確認
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}

export default function AdminWorldboss() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [dialogState, { handleOpen: openDialog, handleClose: closeDialog }] =
    useAlertDialog();
  const [{ data = [], loading }, fetchData] = useAxios(
    "/api/admin/world-bosses",
    { manual: true }
  );
  const [
    { data: updateData, loading: updateLoading, error: updatedError },
    updateDataRequest,
  ] = useAxios({ method: "PUT" }, { manual: true });
  const [{ data: createdData, loading: createdLoading }, createDataRequest] =
    useAxios({ method: "POST" }, { manual: true });
  const [
    { data: deletedData, loading: deletedLoading, error: deletedError },
    deleteDataRequest,
  ] = useAxios({ method: "DELETE" }, { manual: true });
  const [editState, setEditState] = useState({ id: null, isActive: false });
  const [hintState, { handleOpen, handleClose }] = useHintBar();

  const columns = [
    {
      field: "id",
      headerName: "#",
      renderCell: (rawData) => (
        <>
          <IconButton
            size="small"
            onClick={() =>
              setEditState({ id: rawData.value, isActive: true })
            }
          >
            <EditIcon sx={{ color: green[500] }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() =>
              openDialog({
                title: "刪除此世界王",
                description:
                  "刪除之後，將會連帶影響活動中的世界王，確定要刪除嗎？",
                submitText: "刪除",
                cancelText: "取消",
                onCancel: () => closeDialog(),
                onSubmit: () => {
                  deleteDataRequest({
                    url: `/api/admin/world-bosses/${rawData.value}`,
                  });
                  closeDialog();
                },
              })
            }
          >
            <DeleteIcon sx={{ color: red[500] }} />
          </IconButton>
        </>
      ),
    },
    { headerName: "名稱", field: "name", width: 150 },
    { headerName: "等級", field: "level", width: 150 },
    { headerName: "血量", field: "hp", width: 150 },
    { headerName: "經驗", field: "exp", width: 150 },
    { headerName: "女神石", field: "gold", width: 150 },
  ];

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

  const handleSubmit = (formData) => {
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
    <Grid container spacing={2} direction="column">
      <Grid size={{ xs: 12 }}>
        <Typography variant="h5" sx={{ mb: "5px" }}>
          世界王列表
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={data}
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
            loading={loading}
            slots={{
              loadingOverlay: CustomLoadingOverlay,
            }}
          />
        </Paper>
      </Grid>
      <Fab
        aria-label="add"
        onClick={() => setEditState({ id: null, isActive: true })}
        sx={{
          backgroundColor: "#ff6d00",
          color: "#fff",
          "&:hover": { backgroundColor: "#ff6d00", color: "#fff" },
          position: "fixed",
          bottom: "10px",
          right: "10px",
        }}
      >
        <AddIcon />
      </Fab>
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
    </Grid>
  );
}
