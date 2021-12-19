import React, { useEffect, useState, useRef } from "react";
import useAxios from "axios-hooks";
import { DataGrid, GridOverlay } from "@mui/x-data-grid";
import LinearProgress from "@material-ui/core/LinearProgress";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import IconButton from "@material-ui/core/IconButton";
import green from "@material-ui/core/colors/green";
import red from "@material-ui/core/colors/red";
import PropTypes from "prop-types";
import { HeartbeatLoading } from "../../Loading";
import makeStyles from "@material-ui/core/styles/makeStyles";
import withStyles from "@material-ui/core/styles/withStyles";
import Alert from "@material-ui/lab/Alert";
import AlertTitle from "@material-ui/lab/AlertTitle";
import Button from "@material-ui/core/Button";
import MuiFab from "@material-ui/core/Fab";
import AddIcon from "@material-ui/icons/Add";
import ImageIcon from "@material-ui/icons/Image";
import get from "lodash/get";
import HintSnackBar, { useHintBar } from "../../HintSnackBar";
import AlertDialog, { useAlertDialog } from "../../AlertDialog";
import AlertLogin from "../../AlertLogin";

const useStyles = makeStyles(theme => ({
  form: {
    padding: theme.spacing(2),
  },
  media: {
    weight: "100%",
  },
}));

const Fab = withStyles({
  root: {
    backgroundColor: "#ff6d00",
    color: "#fff",
    "&:hover": {
      backgroundColor: "#ff6d00",
      color: "#fff",
    },
    position: "fixed",
    bottom: "10px",
    right: "10px",
  },
})(MuiFab);

const CustomLoadingOverlay = () => {
  return (
    <GridOverlay>
      <div style={{ position: "absolute", top: 0, width: "100%" }}>
        <LinearProgress color="secondary" />
      </div>
    </GridOverlay>
  );
};

const { liff } = window;

const Worldboss = () => {
  const isLoggedIn = liff.isLoggedIn();
  const [
    {
      open: dialogOpen,
      state: { title, description, submitText, cancelText, onSubmit, onCancel },
    },
    { handleOpen: openDialog, handleClose: closeDialog },
  ] = useAlertDialog();
  const [{ data = [], loading }, fetchData] = useAxios("/api/Admin/Worldboss", {
    manual: true,
  });
  const [{ data: updateData, loading: updateLoading, error: updatedError }, updateDataRequest] =
    useAxios(
      {
        method: "PUT",
      },
      {
        manual: true,
      }
    );
  const [{ data: createdData, loading: createdLoading }, createDataRequest] = useAxios(
    {
      method: "POST",
    },
    {
      manual: true,
    }
  );
  const [{ data: deletedData, loading: deletedLoading, error: deletedError }, deleteDataRequest] =
    useAxios(
      {
        method: "DELETE",
      },
      {
        manual: true,
      }
    );
  const [editState, setEditState] = useState({
    id: null,
    isActive: false,
  });
  const [{ message, open, severity }, { handleOpen, handleClose }] = useHintBar();
  const pageLoading = loading;
  const columns = [
    {
      field: "id",
      headerName: "#",
      renderCell: rawData => (
        <>
          <IconButton
            size="small"
            onClick={() =>
              setEditState({
                id: rawData.value,
                isActive: true,
              })
            }
          >
            <EditIcon style={{ color: green[500] }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() =>
              openDialog(old => ({
                ...old,
                title: "刪除此世界王",
                description: "刪除之後，將會連帶影響活動中的世界王，確定要刪除嗎？",
                submitText: "刪除",
                cancelText: "取消",
                onCancel: () => closeDialog(),
                onSubmit: () => {
                  deleteDataRequest({
                    url: `/api/Admin/Worldboss/${rawData.value}`,
                  });
                  closeDialog();
                },
              }))
            }
          >
            <DeleteIcon style={{ color: red[500] }} />
          </IconButton>
        </>
      ),
    },
    {
      headerName: "名稱",
      field: "name",
      width: 150,
    },
    {
      headerName: "等級",
      field: "level",
      width: 150,
    },
    {
      headerName: "血量",
      field: "hp",
      width: 150,
    },
    {
      headerName: "經驗",
      field: "exp",
      width: 150,
    },
    {
      headerName: "女神石",
      field: "gold",
      width: 150,
    },
  ];

  useEffect(() => {
    // 新增後的副作用處理
    if (createdLoading) return;
    if (createdData) {
      handleOpen("新增成功", "success");
      setEditState({
        id: null,
        isActive: false,
      });
      fetchData();
    }
  }, [createdLoading, createdData]);

  useEffect(() => {
    // 更新後的副作用處理
    if (updateLoading) return;
    if (updateData) {
      handleOpen("更新成功", "success");
      setEditState({
        id: null,
        isActive: false,
      });
      fetchData();
    } else if (updatedError) {
      handleOpen("更新失敗", "error");
    }
  }, [updateLoading, updateData]);

  useEffect(() => {
    // 刪除後的副作用處理
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
        url: `/api/Admin/Worldboss/${id}`,
        data: formData,
      });
    } else {
      createDataRequest({
        url: `/api/Admin/Worldboss`,
        data: formData,
      });
    }
  };

  const handleCancel = () => {
    setEditState({
      id: null,
      isActive: false,
    });
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
        <HintSnackBar open={open} message={message} severity={severity} handleClose={handleClose} />
      </>
    );
  }

  return (
    <Grid container spacing={2} direction="column">
      <Grid item xs={12}>
        <Typography variant="h5" component="h5" style={{ marginBottom: "5px" }}>
          世界王列表
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <Paper style={{ width: "100%", height: 500 }}>
          <DataGrid
            columns={columns}
            rows={data}
            disableColumnFilter
            disableColumnSelector
            disableColumnMenu
            loading={pageLoading}
            components={{
              LoadingOverlay: CustomLoadingOverlay,
            }}
          />
        </Paper>
      </Grid>
      <Fab
        color="primary"
        aria-label="add"
        onClick={() =>
          setEditState({
            id: null,
            isActive: true,
          })
        }
      >
        <AddIcon />
      </Fab>
      <HintSnackBar open={open} message={message} severity={severity} handleClose={handleClose} />
      <AlertDialog
        open={dialogOpen}
        handleClose={closeDialog}
        handleOpen={openDialog}
        title={title}
        description={description}
        submitText={submitText}
        cancelText={cancelText}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </Grid>
  );
};

const DataForm = ({ id, onSubmit, onCancel, submitting }) => {
  const classes = useStyles();
  const nameEl = useRef(null);
  const levelEl = useRef(null);
  const hpEl = useRef(null);
  const expEl = useRef(null);
  const goldEl = useRef(null);
  const [{ data = {}, loading }, fetchData] = useAxios(`/api/Admin/Worldboss/${id}`, {
    manual: true,
  });
  const [image, setImage] = useState(null);
  const [{ data: uploadResult = {}, loading: uploading }, doUpload] = useAxios(
    { url: "/api/image", method: "POST" },
    {
      manual: true,
    }
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

  if (loading) return <HeartbeatLoading />;

  const { name, level, hp, exp, gold } = data;

  const handleSubmit = () => {
    onSubmit({
      id,
      name: nameEl.current.value,
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
      let base = get(result, "[2]");
      if (base) {
        doUpload({
          data: {
            image: base,
          },
          timeout: 60 * 1000,
        });
      }
    };
  };

  return (
    <Grid container direction="column">
      {(submitting || uploading) && <HeartbeatLoading />}
      <Grid item xs={12}>
        <Typography variant="h5" component="h5" style={{ marginBottom: "5px" }}>
          世界王資料
        </Typography>
      </Grid>
      <Grid item>
        <Alert severity="warning">
          <AlertTitle>注意！</AlertTitle>
          <strong>經驗與女神石</strong>設定需配合血量比例，建議比例為
          1血量:1經驗，女神石則視情況而定
        </Alert>
      </Grid>
      <Grid
        container
        item
        xs={12}
        component={Paper}
        className={classes.form}
        direction="column"
        alignItems="center"
      >
        {image && (
          <Grid item>
            <img src={image} className={classes.media} style={{ maxWidth: "200px" }} />
          </Grid>
        )}
        <Grid container item spacing={1}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              variant="outlined"
              label="名稱"
              defaultValue={name}
              margin="normal"
              inputRef={nameEl}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              variant="outlined"
              label="等級"
              defaultValue={level}
              margin="normal"
              inputRef={levelEl}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              variant="outlined"
              label="血量"
              defaultValue={hp}
              margin="normal"
              inputRef={hpEl}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              variant="outlined"
              label="經驗"
              defaultValue={exp}
              margin="normal"
              inputRef={expEl}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              variant="outlined"
              label="女神石"
              defaultValue={gold}
              margin="normal"
              inputRef={goldEl}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="圖片"
              variant="outlined"
              margin="normal"
              defaultValue={image}
              value={image}
              onChange={event => setImage(event.target.value)}
              InputProps={{
                endAdornment: (
                  <IconButton component="label">
                    <input type="file" hidden accept="image/*" onChange={handleUploadImage} />
                    <ImageIcon />
                  </IconButton>
                ),
              }}
            />
          </Grid>
        </Grid>

        <Grid container item spacing={2}>
          <Grid item xs={6}>
            <Button fullWidth variant="contained" color="secondary" onClick={onCancel}>
              取消
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button fullWidth variant="contained" color="primary" onClick={handleSubmit}>
              確認
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};

DataForm.propTypes = {
  id: PropTypes.number,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  submitting: PropTypes.bool.isRequired,
};

export default Worldboss;
