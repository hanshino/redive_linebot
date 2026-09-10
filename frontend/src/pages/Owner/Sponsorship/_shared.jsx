import { useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
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
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
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

/** 頁首：沿用 Admin/Coupon 的漸層 hero，改用 secondary（布丁色）區隔「贊助」。 */
export function Hero({ icon, title, subtitle, children }) {
  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
        p: { xs: 2.5, sm: 3.5 },
        color: "#fff",
        background: t =>
          `linear-gradient(135deg, ${t.palette.secondary.dark} 0%, ${t.palette.secondary.main} 100%)`,
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {icon && <Box sx={{ display: "flex", "& svg": { fontSize: 44, opacity: 0.85 } }}>{icon}</Box>}
      <Box sx={{ flex: 1, minWidth: 160 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}
