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
    key: "Princess",
    enableScreen: ["utou", "room", "group", "external"],
    title: "公主連結指令",
    description: "與公主連結相關的所有指令",
    buttons: [
      { title: "Rank表", description: "由無羽製作的表格，提供所有角色詳細推薦表", text: "rank" },
      { title: "模擬抽蛋", description: "自製模擬抽獎系統，每天都有一次的特別抽哦！", text: "#抽" },
      {
        title: "好友小卡",
        description: "透過綁定遊戲ID，可發送好友小卡，請人加你好友！",
        text: "#好友小卡",
      },
      { title: "官方公告", description: "即時獲取官方公告", text: "#官方公告" },
      { title: "官方活動", description: "顯示目前正在舉辦的遊戲活動", text: "#公主行事曆" },
      { title: "前作劇情", description: "觀看巴友們翻譯的前作劇情", text: "#前作劇情" },
      { title: "角色資訊", description: "查看角色資訊", text: "#角色資訊 布丁" },
      { title: "角色技能", description: "查看角色技能", text: "#角色技能 布丁" },
      { title: "角色行動", description: "查看角色行動", text: "#角色行動 布丁" },
      { title: "角色裝備", description: "查看角色裝備", text: "#角色裝備 布丁" },
      { title: "角色", description: "查看角色", text: "#角色 布丁" },
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
  {
    key: "ArenaOrder",
    enableScreen: ["utou", "external"],
    title: "競技場指令",
    description: "有關競技場的所有指令，可進行上傳戰報、查詢解陣配置",
    buttons: [
      {
        title: "上傳戰報",
        description: "將競技場的戰鬥結果上傳，提供其他玩家查詢",
        text: ".arenaupload",
      },
      {
        title: "解陣查詢",
        description: "上傳競技場敵方配置，為您查詢最符合的結果",
        text: ".arenasearch",
      },
    ],
  },
  {
    key: "GuildBattleOrder",
    enableScreen: ["utou", "external"],
    title: "戰隊指令",
    description: "此只收錄1對1聊天可使用指令，詳細戰隊指令可透過報名表查看",
    buttons: [
      {
        title: "回報傷害",
        description: "將戰鬥結果上傳，完成戰隊系統的回報",
        text: ".formreport",
      },
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
      <Grid container className={classes.container} justify="center">
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
