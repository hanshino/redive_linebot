import React, { useEffect, useState, useRef } from "react";
import useAxios from "axios-hooks";
import AlertLogin from "../../AlertLogin";
import Grid from "@material-ui/core/Grid";
import MaterialTable from "material-table";
import TableLocal from "../../../config/TableLocaliztion";
import { HeartbeatLoading } from "../../Loading";
import HintSnackBar, { useHintBar } from "../../HintSnackBar";
import {
  FormControl,
  FormLabel,
  Input,
  Paper,
  TextField,
  makeStyles,
  Typography,
  NativeSelect,
  FormHelperText,
  Button,
} from "@material-ui/core";
import PropTypes from "prop-types";

const useStyles = makeStyles(theme => ({
  form: {
    padding: theme.spacing(2),
  },
}));

const { liff } = window;

const WorldbossEvent = () => {
  const isLoggedIn = liff.isLoggedIn();
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();
  const [{ data, loading, error }, fetchData] = useAxios("/api/Admin/WorldBossEvent", {
    manual: true,
  });
  const [{ data: createdResponse, loading: createdLoading, error: createdError }, createData] =
    useAxios(
      {
        url: "/api/Admin/WorldBossEvent",
        method: "POST",
      },
      {
        manual: true,
      }
    );
  const [{ data: updatedResponse, loading: updatedLoading, error: updatedError }, updateData] =
    useAxios(
      {
        method: "PUT",
      },
      {
        manual: true,
      }
    );
  const [{ data: deletedResponse, loading: deletedLoading, error: deletedError }, deleteData] =
    useAxios(
      {
        method: "DELETE",
      },
      {
        manual: true,
      }
    );

  const [mode, setMode] = useState("list");

  const columns = [
    {
      title: "boss編號",
      field: "world_boss_id",
      editable: "never",
    },
    {
      title: "活動公告",
      field: "announcement",
    },
    {
      title: "活動時間",
      field: "start_time",
      type: "datetime",
    },
    {
      title: "活動結束時間",
      field: "end_time",
      type: "datetime",
    },
  ];

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    // 處理讀取資料的副作用
    if (error) {
      handleOpen(error.message, "error");
    }
  }, [error]);

  useEffect(() => {
    // 處理新增資料的副作用
    if (createdLoading) {
      return;
    }

    if (createdError) {
      handleOpen(createdError.message, "error");
    } else if (createdResponse) {
      setMode("list");
      handleOpen("新增成功", "success");
      fetchData();
    }
  }, [createdResponse]);

  useEffect(() => {
    // 處理更新資料的副作用
    if (updatedLoading) {
      return;
    }

    if (updatedError) {
      handleOpen(updatedError.message, "error");
    } else if (updatedResponse) {
      handleOpen("更新成功", "success");
      fetchData();
    }
  }, [updatedResponse]);

  useEffect(() => {
    // 處理刪除資料的副作用
    if (deletedLoading) {
      return;
    }

    if (deletedError) {
      handleOpen(deletedError.message, "error");
    } else if (deletedResponse) {
      handleOpen("刪除成功", "success");
      fetchData();
    }
  }, [deletedResponse]);

  const pageLoading = loading || createdLoading || updatedLoading || deletedLoading;

  if (mode === "create") {
    return (
      <>
        <EditForm
          onCancel={() => setMode("list")}
          onSubmit={formData => createData({ data: formData })}
        />
        {pageLoading && <HeartbeatLoading />}
      </>
    );
  }

  return (
    <Grid container direction="column">
      <Grid item>
        <MaterialTable
          title="世界boss活動"
          columns={columns}
          data={data}
          localization={TableLocal}
          isLoading={loading}
          options={{
            search: false,
            paging: false,
            sorting: false,
          }}
          actions={[
            {
              icon: "add",
              tooltip: "新增",
              isFreeAction: true,
              onClick: () => setMode("create"),
            },
            {
              icon: "delete",
              tooltip: "刪除",
              onClick: (event, rowData) => {
                deleteData({ url: `/api/Admin/WorldBossEvent/${rowData.id}` });
              },
            },
          ]}
          editable={{
            onRowUpdate: (newData, oldData) =>
              updateData({
                url: `/api/Admin/WorldBossEvent/${oldData.id}`,
                data: newData,
              }),
          }}
        />
      </Grid>
      {pageLoading && <HeartbeatLoading />}
      <HintSnackBar open={open} message={message} severity={severity} handleClose={handleClose} />
    </Grid>
  );
};

const EditForm = ({ onCancel, onSubmit }) => {
  const classes = useStyles();
  const [{ data: bossData = [], loading }] = useAxios("/api/Admin/WorldBoss");
  const bossEl = useRef(null);
  const announceEl = useRef(null);
  const startTimeEl = useRef(null);
  const endTimeEl = useRef(null);

  const handleSubmit = () => {
    const [startAt, endAt] = [startTimeEl.current.value, endTimeEl.current.value];

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
    <Grid container spacing={1} component={Paper} className={classes.form}>
      {loading && <HeartbeatLoading />}
      <Grid item xs={12}>
        <Typography variant="h5">世界王活動管理</Typography>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <NativeSelect fullWidth inputRef={bossEl}>
            {bossData.map(boss => (
              <option key={boss.id} value={boss.id}>
                {boss.name}
              </option>
            ))}
          </NativeSelect>
          <FormHelperText>請選擇世界王來綁定活動，若無世界王，請先去新增世界王</FormHelperText>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <TextField label="活動公告" multiline fullWidth margin="normal" inputRef={announceEl} />
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth required margin="normal">
          <FormLabel>開始時間</FormLabel>
          <Input inputProps={{ type: "datetime-local" }} inputRef={startTimeEl} />
        </FormControl>
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth required margin="normal">
          <FormLabel>結束時間</FormLabel>
          <Input inputProps={{ type: "datetime-local" }} inputRef={endTimeEl} />
        </FormControl>
      </Grid>
      <Grid item xs={6}>
        <Button variant="contained" color="secondary" fullWidth onClick={onCancel}>
          取消
        </Button>
      </Grid>
      <Grid item xs={6}>
        <Button variant="contained" color="primary" fullWidth onClick={handleSubmit}>
          新增
        </Button>
      </Grid>
    </Grid>
  );
};

EditForm.propTypes = {
  onCancel: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};

export default WorldbossEvent;
