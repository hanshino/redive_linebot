import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  IconButton,
  InputAdornment,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import MessageIcon from "@mui/icons-material/Message";
import ImageIcon from "@mui/icons-material/Image";

const imageRegex = /^https:.*?(jpg|jpeg|tiff|png)$/i;
const MAX_REPLIES = 5;

function ReplyField({ index, value, onChange, onRemove, canRemove }) {
  const isImage = imageRegex.test(value);
  return (
    <TextField
      fullWidth
      label={`回覆 ${index + 1}`}
      value={value}
      onChange={(e) => onChange(index, e.target.value)}
      size="small"
      sx={{ mb: 1 }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              {isImage ? <ImageIcon fontSize="small" /> : <MessageIcon fontSize="small" />}
            </InputAdornment>
          ),
          endAdornment: canRemove ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => onRemove(index)}>
                <RemoveCircleOutlineIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        },
      }}
    />
  );
}

export default function OrderDialog({ open, onClose, onSave, data }) {
  const [order, setOrder] = useState("");
  const [touchType, setTouchType] = useState("1");
  const [senderName, setSenderName] = useState("");
  const [senderIcon, setSenderIcon] = useState("");
  const [replyDatas, setReplyDatas] = useState([""]);

  useEffect(() => {
    if (data) {
      setOrder(data.order || "");
      setTouchType(String(data.touchType || "1"));
      setSenderName(data.senderName || "");
      setSenderIcon(data.senderIcon || "");
      setReplyDatas(data.replyDatas?.length ? data.replyDatas.map((r) => r.reply || "") : [""]);
    } else {
      setOrder("");
      setTouchType("1");
      setSenderName("");
      setSenderIcon("");
      setReplyDatas([""]);
    }
  }, [data, open]);

  const handleReplyChange = (index, value) => {
    setReplyDatas((prev) => prev.map((r, i) => (i === index ? value : r)));
  };

  const handleAddReply = () => {
    if (replyDatas.length < MAX_REPLIES) setReplyDatas((prev) => [...prev, ""]);
  };

  const handleRemoveReply = (index) => {
    setReplyDatas((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    onSave({
      orderKey: data?.orderKey,
      order,
      touchType,
      senderName,
      senderIcon,
      replyDatas: replyDatas.filter((r) => r.trim()).map((reply) => ({ reply })),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{data?.orderKey ? "編輯指令" : "新增指令"}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="指令"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          size="small"
        />
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>觸發方式</InputLabel>
          <Select
            value={touchType}
            label="觸發方式"
            onChange={(e) => setTouchType(e.target.value)}
          >
            <MenuItem value="1">全符合</MenuItem>
            <MenuItem value="2">關鍵字符合</MenuItem>
          </Select>
        </FormControl>
        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="發送名"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="發送頭像"
              value={senderIcon}
              onChange={(e) => setSenderIcon(e.target.value)}
              size="small"
            />
          </Grid>
        </Grid>
        {replyDatas.map((val, i) => (
          <ReplyField
            key={i}
            index={i}
            value={val}
            onChange={handleReplyChange}
            onRemove={handleRemoveReply}
            canRemove={replyDatas.length > 1}
          />
        ))}
        {replyDatas.length < MAX_REPLIES && (
          <Button startIcon={<AddCircleOutlineIcon />} onClick={handleAddReply} size="small">
            新增回覆
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleSubmit} variant="contained">
          儲存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
