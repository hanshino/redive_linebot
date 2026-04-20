import { useEffect, useState } from "react";
import useAxios from "axios-hooks";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Divider,
  IconButton,
  Avatar,
  Alert,
} from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SettingsIcon from "@mui/icons-material/Settings";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import { Link } from "react-router-dom";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";

/* ---------- helpers ---------- */
const fmtDate = ts => {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const STATUS_MAP = {
  0: {
    label: "未交易",
    color: "warning",
    icon: <HourglassEmptyIcon sx={{ fontSize: "14px !important" }} />,
  },
  1: {
    label: "已交易",
    color: "success",
    icon: <CheckCircleIcon sx={{ fontSize: "14px !important" }} />,
  },
  "-1": {
    label: "已取消",
    color: "default",
    icon: <CancelIcon sx={{ fontSize: "14px !important" }} />,
  },
};

/* ---------- SummaryBanner ---------- */
function SummaryBanner({ trades }) {
  const pending = trades.filter(t => t.status === 0).length;
  const completed = trades.filter(t => t.status === 1).length;
  const cancelled = trades.filter(t => t.status === -1).length;

  return (
    <Paper
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: { xs: 3, sm: 4 },
          display: "flex",
          alignItems: "center",
          gap: 2.5,
          flexWrap: "wrap",
        }}
      >
        <StorefrontIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            交易管理
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85, mb: 1 }}>
            在這裡管理您的交易訂單
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <Chip
              icon={<HourglassEmptyIcon sx={{ color: "inherit !important" }} />}
              label={`${pending} 筆進行中`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              icon={<CheckCircleIcon sx={{ color: "inherit !important" }} />}
              label={`${completed} 筆已完成`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              icon={<CancelIcon sx={{ color: "inherit !important" }} />}
              label={`${cancelled} 筆已取消`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

/* ---------- TradeRow ---------- */
function TradeRow({ trade }) {
  const statusInfo = STATUS_MAP[trade.status] || STATUS_MAP["-1"];

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Avatar
          sx={{
            width: 40,
            height: 40,
            bgcolor:
              trade.status === 0
                ? "warning.main"
                : trade.status === 1
                  ? "success.main"
                  : "grey.400",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          #{trade.id}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              商品 #{trade.item_id}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip
                icon={statusInfo.icon}
                label={statusInfo.label}
                size="small"
                color={statusInfo.color}
                variant={trade.status === 0 ? "filled" : "outlined"}
                sx={{ fontWeight: 600, fontSize: "0.75rem", height: 24 }}
              />
              {trade.status === 0 && (
                <IconButton
                  size="small"
                  color="primary"
                  component={Link}
                  to={`/trade/${trade.id}/detail`}
                  sx={{ ml: 0.5 }}
                >
                  <SettingsIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              價格：<strong>{trade.price}</strong> 女神石
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              建立：{fmtDate(trade.created_at)}
            </Typography>
            {trade.sold_at && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                成交：{fmtDate(trade.sold_at)}
              </Typography>
            )}
            {trade.closed_at && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                關閉：{fmtDate(trade.closed_at)}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* ---------- TradeList ---------- */
function TradeList({ trades, page, onPageChange }) {
  if (trades.length === 0) {
    return (
      <Paper sx={{ p: { xs: 4, sm: 5 }, textAlign: "center", borderRadius: 3 }}>
        <ReceiptLongIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          尚無交易紀錄
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          交易紀錄
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" onClick={() => onPageChange(page - 1)} disabled={page === 0}>
            <NavigateBeforeIcon fontSize="small" />
          </IconButton>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              minWidth: 32,
              textAlign: "center",
            }}
          >
            {page + 1}
          </Typography>
          <IconButton
            size="small"
            onClick={() => onPageChange(page + 1)}
            disabled={trades.length < 10}
          >
            <NavigateNextIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {trades.map((trade, i) => (
        <Box key={trade.id}>
          {i > 0 && <Divider />}
          <TradeRow trade={trade} />
        </Box>
      ))}
    </Paper>
  );
}

/* ---------- Loading skeleton ---------- */
function ManageSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Skeleton variant="rounded" height={120} animation="wave" />
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} variant="rounded" height={64} animation="wave" />
      ))}
    </Box>
  );
}

/* ---------- TradeManage (main export) ---------- */
export default function TradeManage() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [page, setPage] = useState(0);
  const [{ data: marketList, loading, error }, fetchMarketList] = useAxios(
    {
      url: "/api/trades",
      params: {
        page: page + 1,
        per_page: 10,
      },
    },
    { manual: true }
  );

  useEffect(() => {
    document.title = "交易管理";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchMarketList();
  }, [isLoggedIn, fetchMarketList]);

  const handlePageChange = newPage => {
    setPage(newPage);
    fetchMarketList({
      params: {
        page: newPage + 1,
        per_page: 10,
      },
    });
  };

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (loading && !marketList) {
    return <ManageSkeleton />;
  }

  const trades = marketList || [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <SummaryBanner trades={trades} />

      {error && <Alert severity="error">載入交易資料失敗，請稍後再試</Alert>}

      <TradeList trades={trades} page={page} onPageChange={handlePageChange} />
    </Box>
  );
}
