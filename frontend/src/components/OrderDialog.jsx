import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Stack,
  TextField,
  Button,
  IconButton,
  Avatar,
  Chip,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Link,
  Alert,
  useMediaQuery,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const IMG_RE = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const MAX_REPLIES = 5;
const TYPES = [
  { key: "text", label: "文字" },
  { key: "image", label: "圖片" },
  { key: "sticker", label: "貼圖" },
  { key: "flex", label: "Flex" },
];
const TOUCH_OPTIONS = [
  { v: "1", label: "全符合", sub: "完全一致才觸發" },
  { v: "2", label: "關鍵字符合", sub: "訊息包含即觸發" },
];

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emptyReply = () => ({ id: uid(), messageType: "text", reply: "" });

function normalizeReplies(replyDatas) {
  if (!Array.isArray(replyDatas) || replyDatas.length === 0) return [emptyReply()];
  return replyDatas.map(r => ({
    id: uid(),
    messageType: r.messageType || "text",
    reply: r.reply ?? "",
  }));
}

function isReplyValid(r) {
  if (r.messageType === "flex") {
    try {
      const p = JSON.parse(r.reply || "");
      return !!(p && p.contents);
    } catch {
      return false;
    }
  }
  if (r.messageType === "sticker") {
    try {
      const p = JSON.parse(r.reply || "");
      return !!(p && p.packageId && p.stickerId);
    } catch {
      return false;
    }
  }
  return r.reply.trim().length > 0;
}

function SectionLabel({ title, right }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.25 }}>
      <Typography
        variant="overline"
        sx={{ fontWeight: 700, letterSpacing: "0.9px", lineHeight: 1, color: "text.secondary" }}
      >
        {title}
      </Typography>
      {right}
    </Box>
  );
}

function TouchTypeSelector({ value, onChange }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.875 }}>
        觸發方式
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        onChange={(_, v) => v && onChange(v)}
        sx={{
          gap: 1,
          "& .MuiToggleButton-root": {
            flexDirection: "column",
            alignItems: "flex-start",
            textAlign: "left",
            border: "1.5px solid",
            borderColor: "divider",
            borderRadius: 2,
            textTransform: "none",
            py: 1,
            px: 1.5,
          },
          "& .MuiToggleButton-root.Mui-selected": {
            borderColor: "primary.main",
            bgcolor: theme => alpha(theme.palette.primary.main, 0.08),
            "&:hover": { bgcolor: theme => alpha(theme.palette.primary.main, 0.12) },
          },
        }}
      >
        {TOUCH_OPTIONS.map(o => {
          const active = value === o.v;
          return (
            <ToggleButton key={o.v} value={o.v}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: active ? 600 : 400,
                  color: active ? "primary.dark" : "text.primary",
                }}
              >
                {o.label}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: active ? "primary.main" : "text.disabled", mt: 0.25 }}
              >
                {o.sub}
              </Typography>
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
    </Box>
  );
}

function SenderSection({ open, onToggle, name, icon, onChangeName, onChangeIcon }) {
  const hasVal = !!(name || icon);
  const avatarOk = IMG_RE.test(icon);

  return (
    <Accordion
      expanded={open}
      onChange={(_, e) => onToggle(e)}
      disableGutters
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        mb: 2.5,
        "&::before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ minHeight: 0, "& .MuiAccordionSummary-content": { my: 1 } }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {!open && hasVal && (
            <Avatar
              src={avatarOk ? icon : undefined}
              sx={{
                width: 22,
                height: 22,
                fontSize: 11,
                bgcolor: theme => alpha(theme.palette.primary.main, 0.12),
                color: "primary.main",
              }}
            >
              {!avatarOk && (name ? name[0].toUpperCase() : "?")}
            </Avatar>
          )}
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            發送者外觀
          </Typography>
          {!open && (
            <Typography variant="caption" color={hasVal ? "text.secondary" : "text.disabled"}>
              {hasVal ? name || "（已設定）" : "選填"}
            </Typography>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Avatar
            src={avatarOk ? icon : undefined}
            sx={{
              width: 54,
              height: 54,
              fontSize: 20,
              fontWeight: 700,
              bgcolor: theme => alpha(theme.palette.primary.main, 0.12),
              color: "primary.main",
            }}
          >
            {!avatarOk && (name ? name[0].toUpperCase() : "?")}
          </Avatar>
          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              label="發送名稱"
              size="small"
              fullWidth
              value={name}
              onChange={e => onChangeName(e.target.value)}
            />
            <TextField
              label="頭像 URL"
              size="small"
              fullWidth
              placeholder="https://…"
              value={icon}
              onChange={e => onChangeIcon(e.target.value)}
              helperText={icon && !avatarOk ? "非圖片格式，無法預覽" : " "}
            />
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function StickerInputs({ value, onChange, showErr }) {
  let pkg = "";
  let sid = "";
  try {
    const p = JSON.parse(value || "{}");
    pkg = p.packageId || "";
    sid = p.stickerId || "";
  } catch {
    /* leave defaults */
  }

  const push = (newPkg, newSid) =>
    onChange(JSON.stringify({ packageId: newPkg, stickerId: newSid }));

  return (
    <Stack spacing={1}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
        <TextField
          label="packageId"
          size="small"
          value={pkg}
          onChange={e => push(e.target.value, sid)}
          error={showErr && !pkg}
          helperText={showErr && !pkg ? "必填" : " "}
        />
        <TextField
          label="stickerId"
          size="small"
          value={sid}
          onChange={e => push(pkg, e.target.value)}
          error={showErr && !sid}
          helperText={showErr && !sid ? "必填" : " "}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        <Link
          href="https://developers.line.biz/en/docs/messaging-api/sticker-list/"
          target="_blank"
          rel="noreferrer"
        >
          查看 LINE 官方貼圖列表 →
        </Link>
      </Typography>
    </Stack>
  );
}

function parseFlexValue(raw) {
  try {
    const p = JSON.parse(raw || "{}");
    return {
      alt: p.altText || "",
      body: p.contents ? JSON.stringify(p.contents, null, 2) : "",
    };
  } catch {
    return { alt: "", body: "" };
  }
}

function FlexInputs({ value, onChange, showErr }) {
  const [alt, setAlt] = useState(() => parseFlexValue(value).alt);
  const [body, setBody] = useState(() => parseFlexValue(value).body);
  const [parseErr, setParseErr] = useState(false);

  const push = (newAlt, newBody) => {
    try {
      const contents = JSON.parse(newBody);
      onChange(JSON.stringify({ altText: newAlt, contents }));
      setParseErr(false);
    } catch {
      setParseErr(true);
    }
  };

  const handleAlt = v => {
    setAlt(v);
    push(v, body);
  };
  const handleBody = v => {
    setBody(v);
    push(alt, v);
  };
  const formatJson = () => {
    try {
      const f = JSON.stringify(JSON.parse(body), null, 2);
      setBody(f);
      push(alt, f);
    } catch {
      /* keep as-is */
    }
  };

  const showEmptyErr = showErr && !body.trim();

  return (
    <Stack spacing={1.25}>
      <TextField
        label="替代文字 (altText)"
        size="small"
        value={alt}
        onChange={e => handleAlt(e.target.value)}
        helperText="推播通知 / 不支援 Flex 環境的顯示文字"
      />
      <Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 0.5,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Flex contents JSON
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={parseErr || !body.trim()}
            onClick={formatJson}
            sx={{ minWidth: 0, px: 1.25, py: 0.25, fontSize: 11.5 }}
          >
            格式化
          </Button>
        </Box>
        <TextField
          multiline
          rows={10}
          fullWidth
          value={body}
          onChange={e => handleBody(e.target.value)}
          placeholder={'{\n  "type": "bubble",\n  "body": { ... }\n}'}
          error={parseErr || showEmptyErr}
          helperText={parseErr ? "JSON 格式有誤" : showEmptyErr ? "請貼上 Flex contents JSON" : " "}
          slotProps={{
            input: {
              sx: {
                fontFamily: '"Roboto Mono", monospace',
                fontSize: 12.5,
                lineHeight: 1.65,
                bgcolor: "#f7f9fc",
              },
            },
          }}
        />
      </Box>
    </Stack>
  );
}

function ReplyCard({ item, idx, total, onChange, onRemove, onMoveUp, onMoveDown, showErr }) {
  const empty = !item.reply.trim();
  const isPlain = item.messageType === "text" || item.messageType === "image";
  const cardErr = showErr && empty && isPlain;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        mb: 1,
        borderRadius: 2,
        borderColor: cardErr ? "error.main" : "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
          回覆 {idx + 1}
        </Typography>
        <Stack direction="row" spacing={0.25}>
          <IconButton size="small" disabled={idx === 0} onClick={onMoveUp} title="上移">
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" disabled={idx === total - 1} onClick={onMoveDown} title="下移">
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            disabled={total === 1}
            onClick={() => onRemove(item.id)}
            title="移除"
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={item.messageType}
        onChange={(_, t) => t && onChange(item.id, "messageType", t)}
        sx={{
          mb: 1.5,
          flexWrap: "wrap",
          gap: 0.5,
          "& .MuiToggleButton-root": {
            border: "1.5px solid",
            borderColor: "divider",
            borderRadius: "20px !important",
            px: 1.5,
            py: 0.25,
            fontSize: 12.5,
            textTransform: "none",
          },
          "& .Mui-selected": {
            color: "primary.dark",
            borderColor: "primary.main",
            bgcolor: theme => `${alpha(theme.palette.primary.main, 0.08)} !important`,
          },
        }}
      >
        {TYPES.map(t => (
          <ToggleButton key={t.key} value={t.key}>
            {t.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {item.messageType === "text" && (
        <TextField
          label="回覆文字"
          multiline
          rows={3}
          fullWidth
          size="small"
          placeholder="輸入回覆內容…"
          value={item.reply}
          onChange={e => onChange(item.id, "reply", e.target.value)}
          error={showErr && !item.reply.trim()}
          helperText={showErr && !item.reply.trim() ? "請填寫回覆內容" : " "}
        />
      )}

      {item.messageType === "image" && (
        <Stack spacing={1}>
          <TextField
            label="圖片 URL"
            fullWidth
            size="small"
            placeholder="https://example.com/image.jpg"
            value={item.reply}
            onChange={e => onChange(item.id, "reply", e.target.value)}
            error={showErr && !item.reply.trim()}
            helperText={showErr && !item.reply.trim() ? "請填寫圖片網址" : " "}
          />
          {IMG_RE.test(item.reply) && (
            <Box
              component="img"
              src={item.reply}
              alt=""
              sx={{
                width: "100%",
                maxHeight: 140,
                objectFit: "cover",
                borderRadius: 1.5,
                border: "1px solid",
                borderColor: "divider",
                display: "block",
              }}
              onError={e => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </Stack>
      )}

      {item.messageType === "sticker" && (
        <StickerInputs
          value={item.reply}
          onChange={v => onChange(item.id, "reply", v)}
          showErr={showErr}
        />
      )}

      {item.messageType === "flex" && (
        <FlexInputs
          value={item.reply}
          onChange={v => onChange(item.id, "reply", v)}
          showErr={showErr}
        />
      )}
    </Paper>
  );
}

export default function OrderDialog({ open, onClose, onSave, data }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [order, setOrder] = useState("");
  const [touchType, setTouchType] = useState("1");
  const [senderName, setSenderName] = useState("");
  const [senderIcon, setSenderIcon] = useState("");
  const [senderOpen, setSenderOpen] = useState(false);
  const [replies, setReplies] = useState([emptyReply()]);
  const [showErr, setShowErr] = useState(false);

  useEffect(() => {
    if (!open) return;
    const name = data?.senderName || "";
    const icon = data?.senderIcon || "";
    setOrder(data?.order || "");
    setTouchType(String(data?.touchType || "1"));
    setSenderName(name);
    setSenderIcon(icon);
    setSenderOpen(!!(name || icon));
    setReplies(normalizeReplies(data?.replyDatas));
    setShowErr(false);
  }, [data, open]);

  const orderKey = data?.orderKey || "";
  const isEdit = !!orderKey;
  const replyCount = replies.length;
  const isValid = order.trim() && replies.some(isReplyValid);
  const noReplies = showErr && !replies.some(isReplyValid);

  const updateReply = (id, field, val) =>
    setReplies(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        if (field === "messageType" && val !== r.messageType) {
          return { ...r, messageType: val, reply: "" };
        }
        return { ...r, [field]: val };
      })
    );

  const addReply = () => {
    if (replies.length < MAX_REPLIES) setReplies(prev => [...prev, emptyReply()]);
  };

  const removeReply = id => setReplies(prev => prev.filter(r => r.id !== id));

  const moveReply = (i, dir) =>
    setReplies(prev => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });

  const handleSubmit = () => {
    setShowErr(true);
    if (!isValid) return;
    onSave({
      ...(orderKey ? { orderKey } : {}),
      order,
      touchType,
      senderName,
      senderIcon,
      replyDatas: replies
        .filter(isReplyValid)
        .map(r => ({ messageType: r.messageType, reply: r.reply })),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 3 } } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          py: 2,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {isEdit ? "編輯指令" : "新增指令"}
          </Typography>
          {isEdit && (
            <Typography variant="caption" color="text.disabled" noWrap component="div">
              {orderKey}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2.5 }}>
        <Box sx={{ mb: 2.75 }}>
          <SectionLabel title="基本資訊" />
          <Stack spacing={1.75}>
            <TextField
              label="指令"
              size="small"
              fullWidth
              value={order}
              onChange={e => setOrder(e.target.value)}
              error={showErr && !order.trim()}
              helperText={showErr && !order.trim() ? "指令不可為空" : "使用者輸入的觸發文字"}
            />
            <TouchTypeSelector value={touchType} onChange={setTouchType} />
          </Stack>
        </Box>

        <SenderSection
          open={senderOpen}
          onToggle={setSenderOpen}
          name={senderName}
          icon={senderIcon}
          onChangeName={setSenderName}
          onChangeIcon={setSenderIcon}
        />

        <Box>
          <SectionLabel
            title="回覆訊息"
            right={
              <Chip
                label={`目前 ${replyCount} / ${MAX_REPLIES}`}
                size="small"
                color={replyCount >= MAX_REPLIES ? "warning" : "primary"}
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            }
          />
          {noReplies && (
            <Alert severity="error" sx={{ mb: 1.25, py: 0.5 }}>
              至少需要一筆非空的回覆訊息
            </Alert>
          )}
          {replies.map((item, i) => (
            <ReplyCard
              key={item.id}
              item={item}
              idx={i}
              total={replies.length}
              onChange={updateReply}
              onRemove={removeReply}
              onMoveUp={() => moveReply(i, -1)}
              onMoveDown={() => moveReply(i, 1)}
              showErr={showErr}
            />
          ))}
          {replyCount < MAX_REPLIES && (
            <Button
              fullWidth
              startIcon={<AddIcon />}
              onClick={addReply}
              sx={{
                py: 1,
                border: "1.5px dashed",
                borderColor: "divider",
                borderRadius: 2,
                color: "primary.main",
                fontWeight: 500,
                "&:hover": {
                  bgcolor: theme => alpha(theme.palette.primary.main, 0.06),
                  borderColor: "primary.light",
                },
              }}
            >
              新增回覆
            </Button>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.75 }}>
        {showErr && !isValid && (
          <Typography variant="caption" color="error" sx={{ flex: 1 }}>
            請修正上方錯誤
          </Typography>
        )}
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleSubmit} variant="contained">
          儲存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
