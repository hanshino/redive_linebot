import { useEffect, useState, useRef } from "react";
import useAxios from "axios-hooks";
import { DataGrid } from "@mui/x-data-grid";
import {
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  FormControl,
  FormLabel,
  FormHelperText,
  NativeSelect,
  Input,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { red } from "@mui/material/colors";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

function EditDialog({ open, onClose, onSubmit, loading: parentLoading }) {
  const [{ data: bossData = [], loading }] = useAxios("/api/Admin/WorldBoss");
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>新增世界王活動</DialogTitle>
      <DialogContent>
        {loading && <FullPageLoading />}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12 }}>
            <FormControl fullWidth>
              <NativeSelect fullWidth inputRef={bossEl}>
                {bossData.map((boss) => (
                  <option key={boss.id} value={boss.id}>
                    {boss.name}
                  </option>
                ))}
              </NativeSelect>
              <FormHelperText>
                請選擇世界王來綁定活動，若無世界王，請先去新增世界王
              </FormHelperText>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="活動公告"
              multiline
              fullWidth
              margin="normal"
              inputRef={announceEl}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth required margin="normal">
              <FormLabel>開始時間</FormLabel>
              <Input
                inputProps={{ type: "datetime-local" }}
                inputRef={startTimeEl}
              />
            </FormControl>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <FormControl fullWidth required margin="normal">
              <FormLabel>結束時間</FormLabel>
              <Input
                inputProps={{ type: "datetime-local" }}
                inputRef={endTimeEl}
              />
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary">
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

export default function AdminWorldbossEvent() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [hintState, { handleOpen, handleClose }] = useHintBar();
  const [{ data, loading, error }, fetchData] = useAxios(
    "/api/Admin/WorldBossEvent",
    { manual: true }
  );
  const [
    { data: createdResponse, loading: createdLoading, error: createdError },
    createData,
  ] = useAxios(
    { url: "/api/Admin/WorldBossEvent", method: "POST" },
    { manual: true }
  );
  const [
    { data: updatedResponse, loading: updatedLoading, error: updatedError },
    updateData,
  ] = useAxios({ method: "PUT" }, { manual: true });
  const [
    { data: deletedResponse, loading: deletedLoading, error: deletedError },
    deleteData,
  ] = useAxios({ method: "DELETE" }, { manual: true });

  const [dialogOpen, setDialogOpen] = useState(false);

  const columns = [
    {
      field: "world_boss_id",
      headerName: "boss編號",
      flex: 1,
    },
    {
      field: "announcement",
      headerName: "活動公告",
      flex: 2,
      editable: true,
    },
    {
      field: "start_time",
      headerName: "活動時間",
      flex: 1.5,
      valueFormatter: (value) => {
        if (!value) return "";
        return new Date(value).toLocaleString("zh-TW");
      },
    },
    {
      field: "end_time",
      headerName: "活動結束時間",
      flex: 1.5,
      valueFormatter: (value) => {
        if (!value) return "";
        return new Date(value).toLocaleString("zh-TW");
      },
    },
    {
      field: "actions",
      headerName: "操作",
      width: 80,
      sortable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() =>
            deleteData({ url: `/api/Admin/WorldBossEvent/${params.row.id}` })
          }
        >
          <DeleteIcon sx={{ color: red[500] }} />
        </IconButton>
      ),
    },
  ];

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
    if (updatedLoading) return;
    if (updatedError) {
      handleOpen(updatedError.message, "error");
    } else if (updatedResponse) {
      handleOpen("更新成功", "success");
      fetchData();
    }
  }, [updatedResponse]);

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

  const pageLoading =
    loading || createdLoading || updatedLoading || deletedLoading;

  const handleProcessRowUpdate = (newRow, oldRow) => {
    updateData({
      url: `/api/Admin/WorldBossEvent/${oldRow.id}`,
      data: newRow,
    });
    return newRow;
  };

  return (
    <Grid container direction="column" spacing={2}>
      <Grid>
        <Typography variant="h5" sx={{ mb: 1 }}>
          世界boss活動
        </Typography>
      </Grid>
      <Grid>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ mb: 1 }}
        >
          新增活動
        </Button>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Paper sx={{ width: "100%" }}>
          <DataGrid
            columns={columns}
            rows={data || []}
            loading={loading}
            autoHeight
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
            processRowUpdate={handleProcessRowUpdate}
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
          />
        </Paper>
      </Grid>
      {pageLoading && <FullPageLoading />}
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
    </Grid>
  );
}
