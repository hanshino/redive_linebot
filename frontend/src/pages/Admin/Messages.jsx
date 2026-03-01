import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import {
  Grid,
  Card,
  CardHeader,
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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AlertLogin from "../../components/AlertLogin";
import liff from "@line/liff";
import useLiff from "../../context/useLiff";

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
  let message = "";
  let avatar = "無";

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
  events.forEach((event) => {
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
  let from = "";
  let avatar = "";
  let title = "";
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
      avatar = "預設";
  }

  return (
    <Card variant="outlined" sx={{ minWidth: 200 }}>
      <CardHeader
        avatar={
          <Avatar src={avatar} alt={source.type} sx={{ width: 56, height: 56 }} />
        }
        title={title}
        subheader={from}
      />
      <CardActions>
        <Button size="small" onClick={() => action(id)}>
          詳細
        </Button>
      </CardActions>
    </Card>
  );
}

function SourceList({ events, handleOpen }) {
  const sourceDatas = genSourceDatas(events);

  return (
    <Grid container spacing={2} sx={{ m: 2 }}>
      {Object.keys(sourceDatas).map((key, index) => (
        <Grid key={index}>
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
      <DialogTitle sx={{ m: 0, p: 2, display: "flex", alignItems: "center" }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {title}
        </Typography>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{ color: (theme) => theme.palette.grey[500] }}
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
          {datas.map((event, index) => {
            const { message, avatar } = analyzeEvent(event);
            return (
              <ListItem key={index} sx={{ py: 0.5 }}>
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
              color="text.secondary"
              sx={{ textAlign: "center", py: 2 }}
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

export default function AdminMessages() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [events, setEvents] = useState([]);
  const [dialogState, setDialog] = useState({
    open: false,
    data: [],
    currId: null,
  });

  useEffect(() => {
    if (!isLoggedIn) return;
    document.title = "管理員後台訊息管理";
    const socket = io("/admin/messages", {
      auth: {
        token: liff.getAccessToken(),
      },
    });

    socket.on("newEvent", (event) => handleEvent(event));
    socket.on("error", (msg) => alert(msg));

    return () => {
      socket.close();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (dialogState.open && dialogState.currId) {
      setDialog((prev) => ({
        ...prev,
        data: genDialogData(dialogState.currId),
      }));
    }
  }, [events]);

  const handleEvent = (event) => {
    setEvents((prev) => [...prev, event]);
  };

  const genDialogData = (sourceId) => {
    let sourceType = "";
    switch (sourceId[0]) {
      case "C":
        sourceType = "group";
        break;
      case "R":
        sourceType = "room";
        break;
      case "U":
      default:
        sourceType = "user";
        break;
    }

    return events.filter(
      (event) =>
        event.source[`${sourceType}Id`] === sourceId &&
        event.source.type === sourceType
    );
  };

  const handleOpen = (sourceId) => {
    setDialog({
      open: true,
      data: genDialogData(sourceId),
      currId: sourceId,
    });
  };

  const handleClose = () => {
    setDialog({ open: false, data: [], currId: null });
  };

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  return (
    <>
      <SourceList events={events} handleOpen={handleOpen} />
      <ContentDialog
        open={dialogState.open}
        datas={dialogState.data}
        handleClose={handleClose}
      />
    </>
  );
}
