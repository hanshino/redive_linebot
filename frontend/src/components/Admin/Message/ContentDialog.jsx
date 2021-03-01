import React from "react";
import PropTypes from "prop-types";
import { withStyles, makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import MuiDialogTitle from "@material-ui/core/DialogTitle";
import MuiDialogContent from "@material-ui/core/DialogContent";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import Typography from "@material-ui/core/Typography";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import { FixedSizeList } from "react-window";
import Avatar from "@material-ui/core/Avatar";

const styles = theme => ({
  root: {
    margin: 0,
    padding: theme.spacing(2),
  },
  closeButton: {
    position: "absolute",
    right: theme.spacing(1),
    top: theme.spacing(1),
    color: theme.palette.grey[500],
  },
});

const useStyles = makeStyles(theme => ({
  list: {
    width: "100%",
    height: 400,
    maxWidth: 300,
    backgroundColor: theme.palette.background.paper,
  },
  avatar: {
    marginRight: theme.spacing(2),
    marginLeft: theme.spacing(2),
  },
}));

const DialogTitle = withStyles(styles)(props => {
  const { children, classes, onClose, ...other } = props;
  return (
    <MuiDialogTitle disableTypography className={classes.root} {...other}>
      <Typography variant="h6">{children}</Typography>
      {onClose ? (
        <IconButton aria-label="close" className={classes.closeButton} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      ) : null}
    </MuiDialogTitle>
  );
});

const DialogContent = withStyles(theme => ({
  root: {
    padding: theme.spacing(2),
  },
}))(MuiDialogContent);

const RowList = props => {
  const { data, index, style } = props;
  const classes = useStyles();

  if (data.length === 0) return null;
  const event = data[index];
  if (event === undefined) return null;

  var { message, avatar } = analyzeEvent(event);

  return (
    <ListItem button style={style} key={index}>
      <Avatar alt="頭像" src={avatar} className={classes.avatar} />
      <ListItemText primary={message} />
    </ListItem>
  );
};

function analyzeEvent(event) {
  let result = "",
    avatar = "無";

  switch (event.type) {
    case "message":
      result = analyzeMessage(event);
      avatar = event.source.pictureUrl;
      break;
    case "follow":
      result = "加好友";
      avatar = event.source.pictureUrl;
      break;
    case "unfollow":
      result = "封鎖";
      break;
    case "join":
      result = "被邀請入群";
      avatar = event.source.pictureUrl;
      break;
    case "leave":
      result = "被踢離群組";
      break;
    case "memberJoined":
      result = "新成員加入";
      avatar = event.source.pictureUrl;
      break;
    case "memberLeft":
      result = "成員離開群組";
      break;
    default:
      result = "無法辨識";
  }

  return {
    message: result,
    avatar: avatar,
  };
}

function analyzeMessage(event) {
  let message = "";

  switch (event.message.type) {
    case "text":
      message = event.message.text;
      break;
    case "image":
      message = "圖片";
      break;
    case "video":
      message = "影片";
      break;
    case "audio":
      message = "聲音檔";
      break;
    case "file":
      message = "檔案";
      break;
    case "location":
      message = "地址：" + event.message.address;
      break;
    case "sticker":
      message = "貼圖";
      break;
    default:
      message = "無法辨識";
  }

  return message;
}

RowList.propTypes = {
  index: PropTypes.number.isRequired,
  data: PropTypes.array.isRequired,
  style: PropTypes.object.isRequired,
};

export default function ContentDialog(props) {
  const { open, handleClose, datas } = props;
  const classes = useStyles();
  const { title } = getSourceInfo(datas);

  return (
    <Dialog onClose={handleClose} aria-labelledby="customized-dialog-title" open={open}>
      <DialogTitle onClose={handleClose}>{title}</DialogTitle>
      <DialogContent dividers>
        <div className={classes.list}>
          <FixedSizeList
            height={400}
            width={300}
            itemData={datas}
            itemSize={50}
            itemCount={datas.length}
          >
            {RowList}
          </FixedSizeList>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getSourceInfo(datas) {
  if (datas.length === 0)
    return {
      title: "無",
    };

  var { source } = datas[0];
  var title;

  switch (source.type) {
    case "group":
      title = source.groupName;
      break;
    case "user":
      title = source.displayName;
      break;
    case "room":
      title = "房間";
      break;
    default:
      title = "未知";
  }

  return { title };
}

ContentDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  datas: PropTypes.array.isRequired,
};
