import { useState, useEffect, useCallback } from "react";
import { Box, IconButton, Typography, Chip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getDebugLogs, formatDebugLogs, isDebugMode, clearDebugLogs } from "../utils/debugLogger";

export default function DebugOverlay() {
  const [expanded, setExpanded] = useState(true);
  const [logs, setLogs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!isDebugMode()) return;
    const interval = setInterval(() => {
      const current = getDebugLogs();
      setLogs(prev => (prev.length === current.length ? prev : [...current]));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatDebugLogs());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = formatDebugLogs();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  if (!isDebugMode() || !visible) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        bgcolor: "rgba(0, 0, 0, 0.9)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: "11px",
        maxHeight: expanded ? "50vh" : "36px",
        transition: "max-height 0.2s",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: expanded ? "1px solid #333" : "none",
          minHeight: "36px",
          gap: 0.5,
        }}
      >
        <Typography sx={{ fontSize: "11px", fontFamily: "monospace", color: "#0f0", flex: 1 }}>
          DEBUG ({logs.length})
        </Typography>
        {copied && (
          <Chip
            label="Copied!"
            size="small"
            sx={{ height: 20, fontSize: "10px", bgcolor: "#2e7d32", color: "#fff" }}
          />
        )}
        <IconButton size="small" onClick={handleCopy} sx={{ color: "#0f0", p: 0.5 }}>
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => {
            clearDebugLogs();
            setLogs([]);
          }}
          sx={{ color: "#f44336", p: 0.5 }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => setExpanded(v => !v)}
          sx={{ color: "#0f0", p: 0.5 }}
        >
          {expanded ? (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <ExpandLessIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
        <IconButton size="small" onClick={() => setVisible(false)} sx={{ color: "#666", p: 0.5 }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* Log entries */}
      {expanded && (
        <Box sx={{ overflow: "auto", flex: 1, px: 1, py: 0.5 }}>
          {logs.map((log, i) => (
            <Box key={i} sx={{ py: 0.25, lineHeight: 1.4 }}>
              <Typography
                component="span"
                sx={{ color: "#666", fontSize: "11px", fontFamily: "monospace" }}
              >
                [{log.timestamp}]
              </Typography>{" "}
              <Typography
                component="span"
                sx={{ color: "#4fc3f7", fontSize: "11px", fontFamily: "monospace" }}
              >
                {log.event}
              </Typography>{" "}
              <Typography
                component="span"
                sx={{ color: "#aaa", fontSize: "11px", fontFamily: "monospace" }}
              >
                {log.dataStr}
              </Typography>
            </Box>
          ))}
          {logs.length === 0 && (
            <Typography sx={{ color: "#666", fontSize: "11px", fontFamily: "monospace" }}>
              Waiting for events...
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
