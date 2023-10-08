import React, { useMemo, useState, useEffect } from "react";
import PropTypes from "prop-types";
import { makeStyles } from "@material-ui/core/styles";
import AppBar from "@material-ui/core/AppBar";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import Grid from "@material-ui/core/Grid";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemSecondaryAction from "@material-ui/core/ListItemSecondaryAction";
import ListItemText from "@material-ui/core/ListItemText";
import SendIcon from "@material-ui/icons/Send";
import IconButton from "@material-ui/core/IconButton";
import { useSendMessage } from "../../hooks/liff";
import { CopyToClipboard } from "react-copy-to-clipboard";
import MuiAlert from "@material-ui/lab/Alert";
import Snackbar from "@material-ui/core/Snackbar";

function Alert(props) {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
}

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`scrollable-auto-tabpanel-${index}`}
      aria-labelledby={`scrollable-auto-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `scrollable-auto-tab-${index}`,
    "aria-controls": `scrollable-auto-tabpanel-${index}`,
  };
}

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1,
    width: "100%",
    backgroundColor: theme.palette.background.paper,
  },
  container: {
    padding: theme.spacing(1),
  },
  list: {
    width: "100%",
  },
}));

const TabDatas = [
  {
    key: "Bot",
    enableScreen: ["utou", "room", "group", "external"],
    title: "機器人指令",
    description: "機器人指令說明，包含了一些封包資訊，通常做為 debug 使用",
    buttons: [
      { title: "實用連結", description: "整合了布丁的一些實用連結", text: "/link" },
      { title: "來源查詢", description: "查詢目前發送訊息的詳細來源", text: "/source" },
      {
        title: "伺服器內用戶狀態查詢",
        description: "查詢目前發送的來源的 session 資訊",
        text: "/state",
      },
    ],
  },
  {
    key: "ChatLevel",
    enableScreen: ["utou", "room", "group", "external"],
    title: "聊天等級系統",
    description: "自創等級系統，經過精密計算後，在群組聊天時都能獲得經驗並賦予最幹話之人稱號",
    buttons: [
      { title: "狀態查詢", description: "查詢目前自己的等級、排名、稱號", text: "/me" },
      {
        title: "查朋友狀態",
        description: "此功能需在群組內，進行tag才可查詢",
        text: "#狀態 @tag朋友1 @tag朋友2",
      },
      { title: "等級排行", description: "查詢前5排名的玩家", text: "#等級排行" },
    ],
  },
  {
    key: "Group",
    enableScreen: ["group", "external"],
    title: "群組管理",
    description:
      "群組數據的管理，包含：說話次數記錄、機器人頭像、Discord訊息轉發、指令功能開關、歡迎訊息設定",
    buttons: [
      { title: "群組管理", description: "設定&狀態", text: ".groupconfig" },
      { title: "群組狀態", description: "狀態顯示", text: "/group" },
    ],
  },
  {
    key: "CustomerOrder",
    enableScreen: ["utou", "room", "group", "external"],
    title: "自訂指令",
    description: "自行設定喜歡的指令，可讓機器人發送文字或是圖片",
    buttons: [
      { title: "新增指令", description: "指令新增", text: "#新增指令" },
      { title: "新增關鍵字指令", description: "關鍵字型指令新增", text: "#新增關鍵字指令" },
      { title: "指令列表", description: "顯示目前擁有的指令", text: ".orderlist" },
      { title: "刪除指令", description: "刪除特定指令", text: "#刪除指令" },
    ],
  },
];

const ManualBar = () => {
  const classes = useStyles();
  const [value, setValue] = useState(0);
  const [{ isSending, isError }, send] = useSendMessage();
  const { type: screenType } = window.liff.getContext();
  const [alert, showAlert] = useState({ open: false, message: "" });
  const [sendable, setSendable] = useState(true);
  const [EnableTabDatas] = useState(
    TabDatas.filter(data => data.enableScreen.indexOf(screenType) !== -1)
  );

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  useEffect(() => {
    if (isError) {
      showAlert({ open: true, message: "發送失敗，不過幫你複製起來囉！請直接到LINE貼上～" });
    }
  }, [isError]);

  // 發送後按鈕 disable 避免重複送出
  useEffect(() => {
    if (isSending) setSendable(false);

    setTimeout(() => {
      setSendable(true);
    }, 5000);
  }, [isSending]);

  const alertClose = () => {
    showAlert({ open: false, message: "" });
  };

  const items = useMemo(
    () =>
      EnableTabDatas[value].buttons.map((item, index) => (
        <ListItem divider key={index}>
          <ListItemText primary={item.title} secondary={item.description} />
          <ListItemSecondaryAction>
            <CopyToClipboard text={item.text}>
              <IconButton disabled={!sendable} edge="end" onClick={() => send(item.text)}>
                <SendIcon />
              </IconButton>
            </CopyToClipboard>
          </ListItemSecondaryAction>
        </ListItem>
      )),
    [EnableTabDatas[value].buttons, sendable]
  );

  return (
    <div className={classes.root}>
      {alert.open && (
        <Snackbar open={alert.open} autoHideDuration={6000} onClose={alertClose}>
          <Alert onClose={alertClose} severity="warning">
            {alert.message}
          </Alert>
        </Snackbar>
      )}
      <AppBar position="static" color="default">
        <Tabs
          value={value}
          onChange={handleChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="on"
          aria-label="scrollable auto tabs"
        >
          {EnableTabDatas.map((data, index) => (
            <Tab key={index} label={data.title} {...a11yProps(index)} />
          ))}
        </Tabs>
      </AppBar>
      <Grid container className={classes.container} justifyContent="center">
        <Grid item container>
          <Grid item>
            <Typography variant="h6" component="h2">
              {EnableTabDatas[value].description}
            </Typography>
          </Grid>
        </Grid>
        <Grid item container>
          <List className={classes.list}>{items}</List>
        </Grid>
      </Grid>
    </div>
  );
};

const Manual = () => {
  const classes = useStyles();
  useEffect(() => {
    window.document.title = "使用手冊";
  }, []);

  return (
    <Grid container>
      <Grid container item className={classes.container}>
        <Grid item>
          <Typography variant="h4">機器人使用手冊</Typography>
          <Typography variant="caption" color="textSecondary">
            幫助你快速上手本機器人所有指令
          </Typography>
        </Grid>
      </Grid>
      <Grid container item>
        <ManualBar />
      </Grid>
    </Grid>
  );
};

export default Manual;
