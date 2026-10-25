import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Grid,
  Card,
  CardActions,
  Button,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Box,
  Paper,
  Alert,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ForumIcon from "@mui/icons-material/Forum";
import InboxIcon from "@mui/icons-material/Inbox";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SyncIcon from "@mui/icons-material/Sync";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import PageHero, { HeroChip } from "../../components/PageHero";

// 事件只留最近這麼多筆：長時間開著頁面時，不讓陣列與畫面無限長大
const MAX_EVENTS = 200;

// 連線狀態一律用文字 + 圖示，不只靠顏色
const SOCKET_STATUS = {
  connecting: { label: "連線中…", icon: <SyncIcon /> },
  connected: { label: "已連線", icon: <CheckCircleIcon /> },
  reconnecting: { label: "連線中斷，重新連線中…", icon: <SyncIcon /> },
  error: { label: "連線失敗，稍後自動重試", icon: <ErrorOutlineIcon /> },
};

// --- Helper functions ---

function analyzeMessage(event) {
  switch (event.message.type) {
    case "text":
      return event.message.text;
    case "image":
      return "圖片";
    case "video":
      return "影片";
    case "audio":
      return "聲音檔";
    case "file":
      return "檔案";
    case "location":
      return "地址：" + event.message.address;
    case "sticker":
      return "貼圖";
    default:
      return "無法辨識";
  }
}

function analyzeEvent(event) {
  let message;
  let avatar;

  switch (event.type) {
    case "message":
      message = analyzeMessage(event);
      avatar = event.source.pictureUrl;
      break;
    case "follow":
      message = "加好友";
      avatar = event.source.pictureUrl;
      break;
    case "unfollow":
      message = "封鎖";
      break;
    case "join":
      message = "被邀請入群";
      avatar = event.source.pictureUrl;
      break;
    case "leave":
      message = "被踢離群組";
      break;
    case "memberJoined":
      message = "新成員加入";
      avatar = event.source.pictureUrl;
      break;
    case "memberLeft":
      message = "成員離開群組";
      break;
    default:
      message = "無法辨識";
  }

  return { message, avatar };
}

function genSourceDatas(events) {
  const result = {};
  events.forEach(event => {
    const { groupId, userId, roomId } = event.source;
    const sourceId = groupId || roomId || userId;
    result[sourceId] = event.source;
  });
  return result;
}

function getSourceInfo(datas) {
  if (datas.length === 0) return { title: "無" };

  const { source } = datas[0];
  switch (source.type) {
    case "group":
      return { title: source.groupName };
    case "user":
      return { title: source.displayName };
    case "room":
      return { title: "房間" };
    default:
      return { title: "未知" };
  }
}

// --- Components ---

function SourceCard({ source, action }) {
  let from;
  let avatar;
  let title;
  const id = source[`${source.type}Id`];

  switch (source.type) {
    case "group":
      title = source.groupName;
      from = "群組";
      avatar = source.groupUrl;
      break;
    case "user":
      title = source.displayName;
      from = "個人";
      avatar = source.pictureUrl;
      break;
    case "room":
      title = source.displayName;
      from = "房間";
      avatar = source.pictureUrl;
      break;
    default:
      title = "預設";
      from = "預設";
  }

  const chipColor =
    source.type === "group" ? "primary" : source.type === "user" ? "success" : "default";

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <Box sx={{ px: 2, pt: 2, pb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Avatar src={avatar} alt={source.type} sx={{ width: 48, height: 48 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            noWrap
            title={title}
            sx={{
              fontWeight: 700,
            }}
          >
            {title}
          </Typography>
          <Chip label={from} size="small" color={chipColor} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <CardActions sx={{ px: 2, pb: 1.5 }}>
        <Button
          variant="outlined"
          onClick={() => action(id)}
          aria-label={`查看 ${title} 的訊息`}
          sx={{ minHeight: 44 }}
        >
          詳細
        </Button>
      </CardActions>
    </Card>
  );
}

function SourceList({ events, handleOpen }) {
  const sourceDatas = genSourceDatas(events);
  const keys = Object.keys(sourceDatas);

  if (keys.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          py: 8,
          gap: 1.5,
          color: "text.secondary",
        }}
      >
        <InboxIcon sx={{ fontSize: 56, opacity: 0.3 }} />
        <Typography
          variant="body1"
          sx={{
            color: "text.secondary",
          }}
        >
          尚無訊息來源，等待即時事件中…
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {keys.map(key => (
        <Grid key={key} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <SourceCard source={sourceDatas[key]} action={handleOpen} />
        </Grid>
      ))}
    </Grid>
  );
}

function ContentDialog({ open, handleClose, datas }) {
  const { title } = getSourceInfo(datas);

  return (
    <Dialog onClose={handleClose} open={open} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            flex: 1,
          }}
        >
          {title}
        </Typography>
        <IconButton
          aria-label="關閉"
          onClick={handleClose}
          sx={{ color: "text.secondary", width: 44, height: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            width: "100%",
            maxHeight: 400,
            overflow: "auto",
            bgcolor: "background.paper",
          }}
        >
          {datas.map(event => {
            const { message, avatar } = analyzeEvent(event);
            return (
              <ListItem key={event._key} sx={{ py: 0.5 }}>
                <ListItemAvatar>
                  <Avatar alt="頭像" src={avatar} sx={{ mr: 2 }} />
                </ListItemAvatar>
                <ListItemText primary={message} />
              </ListItem>
            );
          })}
          {datas.length === 0 && (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                textAlign: "center",
                py: 2,
              }}
            >
              暫無訊息
            </Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// --- Main Component ---

// 從事件列表挑出某個來源（群組 / 房間 / 個人）的事件
function eventsOfSource(events, sourceId) {
  let sourceType = "user";
  if (sourceId[0] === "C") sourceType = "group";
  else if (sourceId[0] === "R") sourceType = "room";

  return events.filter(
    event => event.source[`${sourceType}Id`] === sourceId && event.source.type === sourceType
  );
}

export default function AdminMessages() {
  // 登入與管理員權限由 RequireAdmin 擋在路由外，這裡不用再判斷
  const [events, setEvents] = useState([]);
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [serverError, setServerError] = useState("");
  const [dialogSourceId, setDialogSourceId] = useState(null);
  const keyCounterRef = useRef(0);

  useEffect(() => {
    document.title = "訊息實況";
    const socket = io("/admin/messages", {
      // Auth rides the HttpOnly redive_session cookie; nothing to pass here.
      withCredentials: true,
    });

    socket.on("connect", () => {
      setSocketStatus("connected");
      setServerError("");
    });
    socket.on("disconnect", reason => {
      // 自己關閉（離開頁面）不算異常
      if (reason !== "io client disconnect") setSocketStatus("reconnecting");
    });
    socket.on("connect_error", () => setSocketStatus("error"));
    socket.on("error", msg => setServerError(typeof msg === "string" ? msg : "伺服器回報了錯誤"));
    socket.on("newEvent", event => {
      // 給每筆事件一個穩定的 key（LINE 的 webhookEventId 優先，沒有就自己編號）
      const stamped = {
        ...event,
        _key: event.webhookEventId || `local-${keyCounterRef.current++}`,
      };
      setEvents(prev => [...prev, stamped].slice(-MAX_EVENTS));
    });

    return () => {
      socket.close();
    };
  }, []);

  const dialogOpen = dialogSourceId !== null;
  const dialogData = dialogOpen ? eventsOfSource(events, dialogSourceId) : [];

  const sourceDatas = genSourceDatas(events);
  const sourceCount = Object.keys(sourceDatas).length;
  const status = SOCKET_STATUS[socketStatus];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <PageHero icon={<ForumIcon />} title="訊息實況">
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", width: "100%" }}>
          <HeroChip icon={status.icon} label={status.label} />
          <HeroChip label={`${sourceCount} 個來源`} />
          <HeroChip label={`最近 ${events.length} 則事件`} />
        </Box>
      </PageHero>
      {serverError && (
        <Alert severity="error" onClose={() => setServerError("")}>
          {serverError}
        </Alert>
      )}
      {socketStatus === "error" && (
        <Alert severity="warning">
          無法連上即時訊息服務，畫面不會更新。系統會自動重試；如果一直失敗，請重新整理頁面或重新登入。
        </Alert>
      )}
      {/* Source List */}
      <Paper sx={{ borderRadius: 3, px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
        <SourceList events={events} handleOpen={setDialogSourceId} />
      </Paper>
      <ContentDialog
        open={dialogOpen}
        datas={dialogData}
        handleClose={() => setDialogSourceId(null)}
      />
    </Box>
  );
}
