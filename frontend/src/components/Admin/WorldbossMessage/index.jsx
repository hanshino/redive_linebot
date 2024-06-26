import React, { useEffect } from "react";
import { DataGrid } from "@mui/x-data-grid";
import useAxios from "axios-hooks";
import { Avatar, ButtonGroup, Grid, Button } from "@material-ui/core";
import { Alert, Skeleton } from "@material-ui/lab";
import AddIcon from "@material-ui/icons/Add";
import MuiFab from "@material-ui/core/Fab";
import { withStyles } from "@material-ui/styles";
import { Link } from "react-router-dom";
import makeStyles from "@material-ui/core/styles/makeStyles";
import { CircularProgress } from "@material-ui/core";
import PropTypes from "prop-types";
import { green } from "@material-ui/core/colors";

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

const useStyles = makeStyles(theme => ({
  wrapper: {
    margin: theme.spacing(1),
    position: "relative",
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
}));

const WorldBossMessage = () => {
  const { liff } = window;
  useEffect(() => {
    window.document.title = "管理員用－世界王訊息管理";
  }, []);

  if (!liff.isLoggedIn()) {
    return <Alert severity="error">請先登入</Alert>;
  }

  return (
    <Grid container direction="column" spacing={1}>
      <Grid item>
        <Alert severity="warning">所有紀錄都會記錄作者資訊，請謹慎操作</Alert>
      </Grid>
      <Grid item>
        <DataList />
      </Grid>
      <Fab color="primary" aria-label="add" component={Link} to={"/Admin/WorldbossMessage/Create"}>
        <AddIcon />
      </Fab>
    </Grid>
  );
};

const DataList = () => {
  const [{ data = {}, error, loading }, refetch] = useAxios("/api/Game/World/Boss/Feature/Message");
  const { data: messageData = [] } = data;
  const columns = [
    {
      headerName: "頭像",
      field: "icon_url",
      flex: 0.5,
      renderCell: genAvatar,
    },
    { headerName: "訊息樣板", field: "template", flex: 2 },
    {
      headerName: "操作",
      field: "id",
      flex: 1.4,
      // eslint-disable-next-line react/display-name
      renderCell: rawData => <ControlButtons value={rawData.value} onDeleteComplete={refetch} />,
    },
  ];

  useEffect(() => {
    refetch();
    return () => {};
  }, [window.location.pathname]);

  if (loading) {
    return <Skeleton animation="wave" variant="rect" width="100%" height={300} />;
  }

  if (error) {
    return <Alert severity="error">發生錯誤，請確認是否有管理權限！</Alert>;
  }

  return (
    <div style={{ width: "100%" }}>
      <DataGrid
        columns={columns}
        rows={messageData}
        autoHeight
        disableColumnMenu
        disableColumnFilter
        disableColumnSelector
      />
    </div>
  );
};

function genAvatar({ value }) {
  return <Avatar alt={"頭像"} src={value} />;
}

const ControlButtons = ({ onDeleteComplete, value }) => {
  const classes = useStyles();
  const [{ data = {}, loading }, doDelete] = useAxios(
    {
      url: `/api/Game/World/Boss/Feature/Message/${value}`,
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
    <div className={classes.wrapper}>
      <ButtonGroup color="primary" variant="outlined" disabled={loading}>
        <Button component={Link} to={`/Admin/WorldbossMessage/Update/${value}`}>
          更新
        </Button>
        <Button color="primary" variant="outlined" onClick={handleDelete}>
          刪除
        </Button>
      </ButtonGroup>
      {loading && <CircularProgress size={24} className={classes.buttonProgress} />}
    </div>
  );
};

ControlButtons.propTypes = {
  onDeleteComplete: PropTypes.func.isRequired,
  value: PropTypes.any.isRequired,
};

export default WorldBossMessage;
export { default as WorldBossMessageCreate } from "./create";
export { default as WorldBossMessageUpdate } from "./update";
