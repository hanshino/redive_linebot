import { useMemo, useState, useEffect } from "react";
import {
  AppBar,
  Tabs,
  Tab,
  Typography,
  Box,
  Grid,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  IconButton,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useSendMessage } from "../../hooks/useLiff";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import { getLiffContext } from "../../utils/liff";

function a11yProps(index) {
  return {
    id: `scrollable-auto-tab-${index}`,
    "aria-controls": `scrollable-auto-tabpanel-${index}`,
  };
}

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

function ManualBar() {
  const [value, setValue] = useState(0);
  const [{ isSending, isError }, send] = useSendMessage();
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [sendable, setSendable] = useState(true);

  // Filter tabs based on LIFF context type
  const [EnableTabDatas] = useState(() => {
    try {
      const { type: screenType } = getLiffContext();
      return TabDatas.filter((data) => data.enableScreen.indexOf(screenType) !== -1);
    } catch {
      // Fallback: show all tabs when not in LIFF context
      return TabDatas;
    }
  });

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  useEffect(() => {
    if (isError) {
      showHint("發送失敗，不過幫你複製起來囉！請直接到LINE貼上～", "warning");
    }
  }, [isError, showHint]);

  // Disable button after sending to prevent duplicate sends
  useEffect(() => {
    if (isSending) setSendable(false);

    const timer = setTimeout(() => {
      setSendable(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isSending]);

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
    [EnableTabDatas, value, sendable, send],
  );

  return (
    <Box sx={{ flexGrow: 1, width: "100%", bgcolor: "background.paper" }}>
      <HintSnackBar {...hintState} onClose={closeHint} />
      <AppBar position="static" color="default">
        <Tabs
          value={value}
          onChange={handleChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          aria-label="scrollable auto tabs"
        >
          {EnableTabDatas.map((data, index) => (
            <Tab key={index} label={data.title} {...a11yProps(index)} />
          ))}
        </Tabs>
      </AppBar>
      <Grid container sx={{ p: 1 }} justifyContent="center">
        <Grid size={{ xs: 12 }}>
          <Typography variant="h6" component="h2">
            {EnableTabDatas[value].description}
          </Typography>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <List sx={{ width: "100%" }}>{items}</List>
        </Grid>
      </Grid>
    </Box>
  );
}

export default function Manual() {
  useEffect(() => {
    window.document.title = "使用手冊";
  }, []);

  return (
    <Grid container>
      <Grid size={{ xs: 12 }} sx={{ p: 1 }}>
        <Typography variant="h4">機器人使用手冊</Typography>
        <Typography variant="caption" color="text.secondary">
          幫助你快速上手本機器人所有指令
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <ManualBar />
      </Grid>
    </Grid>
  );
}
