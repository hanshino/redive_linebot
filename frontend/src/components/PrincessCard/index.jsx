import React, { useState, useEffect } from "react";
import Grid from "@material-ui/core/Grid";
import TextField from "@material-ui/core/TextField";
import makeStyles from "@material-ui/core/styles/makeStyles";
import Typography from "@material-ui/core/Typography";
import MenuItem from "@material-ui/core/MenuItem";
import Snackbar from "@material-ui/core/Snackbar";
import Alert from "@material-ui/lab/Alert";
import AlertTitle from "@material-ui/lab/AlertTitle";
import Button from "@material-ui/core/Button";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import InputMask from "react-input-mask";
import PrincessAPI from "../../api/Princess";
import FriendCardAPI from "../../api/FriendCard";
import CardFlex from "./CardFlex";

const useStyles = makeStyles(theme => ({
  container: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },

  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
}));

const PrincessCard = () => {
  const classes = useStyles();
  const isLoggedIn = window.liff.isLoggedIn();
  const servers = [
    { label: "美食殿堂", value: 1 },
    { label: "真步真步王國", value: 2 },
    { label: "破曉之星", value: 3 },
    { label: "小小甜心", value: 4 },
  ];
  const [server, setServer] = useState(1);
  const [uid, setUid] = useState("");
  const [background, setBack] = useState("");
  const [userData, setData] = useState({});
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({
    level: "info",
    message: "輸入訊息",
    open: false,
  });

  const handleShare = () => {
    if (!hasBinding) {
      setAlert({
        ...alert,
        open: true,
        message: "尚未進行綁定",
        level: "warning",
      });
      return;
    }

    window.liff.shareTargetPicker([
      {
        type: "flex",
        altText: "好友小卡",
        contents: CardFlex.genFlex({
          ...userData,
          server: userData.severName,
        }),
      },
    ]);
  };

  const handlReset = async () => {
    setLoading(true);
    let result = await FriendCardAPI.resetData();
    setLoading(false);

    if (result.status === 200) {
      setAlert({
        ...alert,
        open: true,
        message: "已解除綁定",
        level: "success",
      });
      setServer(1);
      setUid("");
      setBack("");
    } else {
      setAlert({
        ...alert,
        open: true,
        message: "解除失敗",
        level: "error",
      });
    }
  };

  const handleAlertClose = () => {
    setAlert({
      ...alert,
      open: false,
    });
  };

  const handleSelectServer = e => {
    setServer(e.target.value);
  };

  const handleInputUid = e => {
    setUid(e.target.value.replace(/\s+/g, ""));
  };

  const handleSave = async () => {
    if (!/^\d{9,10}$/.test(uid)) {
      setAlert({
        ...alert,
        open: true,
        message: "尚未輸入遊戲ID",
        level: "error",
      });
      return;
    }

    setLoading(true);
    let result = await FriendCardAPI.binding({ uid, server, background }).catch(() => false);
    await fetchBindingData();
    setLoading(false);
    if (result.status === 201) {
      setAlert({
        ...alert,
        open: true,
        message: "保存成功",
        level: "success",
      });
    } else {
      setAlert({
        ...alert,
        open: true,
        message: "保存失敗",
        level: "error",
      });
    }
  };

  useEffect(() => {
    window.document.title = "公主ID綁定";
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchCharacterData = async () => {
    let characterData = await PrincessAPI.getCharacterImages();
    setCharacters(characterData);
  };

  const fetchBindingData = async () => {
    let bindData = await FriendCardAPI.getBindData();

    if (Object.keys(bindData).length === 0) {
      setData(bindData);
    } else {
      let serverFindResult = servers.find(server => bindData.server === server.value);
      setData({
        ...bindData,
        serverName: serverFindResult === undefined ? "未知" : serverFindResult.label,
      });
      setUid(bindData.uid);
      setBack(bindData.background);
      setServer(bindData.server);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchCharacterData(), fetchBindingData()]);
    setLoading(false);
  };

  let hasBinding = Object.keys(userData).length !== 0;

  if (!isLoggedIn)
    return (
      <Alert severity="warning">
        <AlertTitle>尚未登入</AlertTitle>
        進行綁定動作前，請先進行登入！
      </Alert>
    );

  return (
    <React.Fragment>
      <Grid container className={classes.container}>
        <Grid container item xs={12}>
          <Typography component="p" variant="h4">
            {"公主連結好友小卡設定"}
          </Typography>
        </Grid>
        {hasBinding ? (
          <Grid item xs={12}>
            <Alert severity="success">
              <AlertTitle>綁定成功</AlertTitle>
              {"您好～來自"}
              <strong>{userData.serverName}</strong>
              {"的"}
              <strong>{userData.nickname}</strong>
            </Alert>
          </Grid>
        ) : null}
        <Grid container item xs={12} spacing={3}>
          <Grid item xs={12} sm={6}>
            <InputMask
              mask="999 999 999"
              value={uid}
              disabled={false}
              maskChar=" "
              onChange={handleInputUid}
            >
              {() => <TextField fullWidth label="遊戲ID" variant="outlined" color="secondary" />}
            </InputMask>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="伺服器"
              variant="outlined"
              color="secondary"
              value={server}
              onChange={handleSelectServer}
              fullWidth
              select
            >
              {servers.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField
              select
              label="背景"
              variant="outlined"
              color="secondary"
              fullWidth
              value={background}
              onChange={e => setBack(e.target.value)}
            >
              {characters.map(option => (
                <MenuItem key={option.name} value={option.image}>
                  {option.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid container item xs={12} justifyContent="flex-end" spacing={2}>
            <Grid item>
              <Button
                variant="contained"
                color="secondary"
                onClick={handlReset}
                disabled={!hasBinding}
              >
                取消綁定
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="contained"
                color="primary"
                onClick={handleShare}
                disabled={!hasBinding}
              >
                分享
              </Button>
            </Grid>
            <Grid item>
              <Button variant="contained" color="primary" onClick={handleSave}>
                保存
              </Button>
            </Grid>
          </Grid>
          {background ? <Grid item xs={12} component="img" src={background} /> : null}
        </Grid>
      </Grid>
      <Snackbar
        open={alert.open}
        autoHideDuration={3000}
        onClose={handleAlertClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={handleAlertClose} severity={alert.level}>
          {alert.message}
        </Alert>
      </Snackbar>
      <Backdrop className={classes.backdrop} open={loading}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </React.Fragment>
  );
};

export default PrincessCard;
