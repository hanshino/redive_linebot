import { useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import PageHero from "../../../components/PageHero";
import { TYPE_META } from "./_format";

export function CopyButton({ text, label = "複製", size = "small" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* 剪貼簿不可用時靜默 */
    }
  };
  return (
    <Tooltip title={done ? "已複製" : label}>
      <IconButton
        size={size}
        aria-label={label}
        onClick={copy}
        color={done ? "success" : "default"}
      >
        {done ? <CheckIcon fontSize="inherit" /> : <ContentCopyIcon fontSize="inherit" />}
      </IconButton>
    </Tooltip>
  );
}

export function TypeChip({ type, size = "small" }) {
  const meta = TYPE_META[type] || { label: type, color: "default" };
  return <Chip label={meta.label} color={meta.color} size={size} variant="outlined" />;
}

export function Field({ label, children, mono = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 600, fontFamily: mono ? "monospace" : undefined, wordBreak: "break-all" }}
      >
        {children ?? "—"}
      </Typography>
    </Box>
  );
}

/** 頁首：共用 PageHero，贊助用 secondary（布丁色）區隔。 */
export function Hero(props) {
  return <PageHero tone="secondary" {...props} />;
}
