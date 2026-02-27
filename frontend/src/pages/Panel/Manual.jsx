import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Divider,
  Stack,
  Tooltip,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import GroupsIcon from "@mui/icons-material/Groups";
import TuneIcon from "@mui/icons-material/Tune";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useSendMessage } from "../../hooks/useLiff";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";

const CategoryIcons = {
  Bot: SmartToyIcon,
  ChatLevel: EmojiEventsIcon,
  Group: GroupsIcon,
  CustomerOrder: TuneIcon,
};

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

function CommandCard({ item, sendable, onSend }) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.2s, border-color 0.2s",
        "&:hover": {
          boxShadow: 2,
          borderColor: "primary.light",
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, pb: 0 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {item.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {item.description}
        </Typography>
      </CardContent>
      <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 1.5 }}>
        <Chip label={item.text} size="small" variant="outlined" sx={{ fontFamily: "monospace" }} />
        <CopyToClipboard text={item.text}>
          <Tooltip title="發送指令">
            <span>
              <IconButton
                color="primary"
                disabled={!sendable}
                onClick={() => onSend(item.text)}
                size="small"
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </CopyToClipboard>
      </CardActions>
    </Card>
  );
}

function CategorySection({ category, sendable, onSend }) {
  const Icon = CategoryIcons[category.key];

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        {Icon && <Icon color="primary" fontSize="small" />}
        <Typography variant="h6" fontWeight={700}>
          {category.title}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {category.description}
      </Typography>
      <Grid container spacing={2}>
        {category.buttons.map((item, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6 }}>
            <CommandCard item={item} sendable={sendable} onSend={onSend} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default function Manual() {
  const { liffContext } = useLiff();
  const [{ isSending, isError }, send] = useSendMessage();
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [sendable, setSendable] = useState(true);

  const filteredCategories = useMemo(() => {
    const screenType = liffContext?.type;
    if (!screenType) return TabDatas;
    return TabDatas.filter((data) => data.enableScreen.includes(screenType));
  }, [liffContext]);

  const handleSend = useCallback(
    (text) => {
      send(text);
    },
    [send],
  );

  useEffect(() => {
    window.document.title = "使用手冊";
  }, []);

  useEffect(() => {
    if (isError) {
      showHint("發送失敗，不過幫你複製起來囉！請直接到LINE貼上～", "warning");
    }
  }, [isError, showHint]);

  useEffect(() => {
    if (isSending) setSendable(false);

    const timer = setTimeout(() => {
      setSendable(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isSending]);

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", px: 2, py: 3 }}>
      <HintSnackBar {...hintState} onClose={closeHint} />

      <Typography variant="h5" fontWeight={700} gutterBottom>
        指令手冊
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        快速發送指令到 LINE 聊天室
      </Typography>

      <Divider sx={{ mb: 3 }} />

      <Stack spacing={4}>
        {filteredCategories.map((category) => (
          <CategorySection
            key={category.key}
            category={category}
            sendable={sendable}
            onSend={handleSend}
          />
        ))}
      </Stack>
    </Box>
  );
}
