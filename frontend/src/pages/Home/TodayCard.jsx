import { useState, useEffect, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import DiamondIcon from "@mui/icons-material/Diamond";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import StorefrontIcon from "@mui/icons-material/Storefront";
import ShoppingBasketIcon from "@mui/icons-material/ShoppingBasket";
import api from "../../services/api";
import LoadError from "../../components/LoadError";

// 登入後首頁的第一塊：今天的簽到狀態、女神石，以及最常用的三個去處。
// 資料來自簽到月曆 API（Signin 頁同一支），一次請求拿到 today / entries / streak / 女神石餘額。
function Stat({ icon, title, caption, tone }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: 2,
          flexShrink: 0,
          color: `${tone}.main`,
          bgcolor: theme => alpha(theme.palette[tone].main, 0.1),
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {caption && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {caption}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function TodayCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchToday = useCallback(() => {
    return api
      .get("/api/me/signins")
      .then(res => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // 首次載入 loading 本來就是 true；只有重試才需要把狀態重設
  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  const load = () => {
    setLoading(true);
    setError(false);
    fetchToday();
  };

  const signedToday = Boolean(data?.entries?.some(e => e.date === data.today));
  const streak = Number(data?.stats?.streak) || 0;
  const balance = Number(data?.godStoneBalance) || 0;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          今天
        </Typography>

        {loading ? (
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <Skeleton variant="rounded" height={44} />
            <Skeleton variant="rounded" height={44} />
          </Box>
        ) : error ? (
          <LoadError message="今天的狀態載入失敗，請稍後再試。" onRetry={load} sx={{ py: 0 }} />
        ) : (
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            {signedToday ? (
              <Stat
                tone="success"
                icon={<CheckCircleIcon />}
                title="今天已簽到"
                caption={`連續簽到 ${streak} 天`}
              />
            ) : (
              <Stat tone="warning" icon={<RadioButtonUncheckedIcon />} title="今天還沒簽到" />
            )}
            <Stat
              tone="secondary"
              icon={<DiamondIcon />}
              title={`${balance.toLocaleString()} 女神石`}
            />
          </Box>
        )}

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2.5 }}>
          <Button
            component={RouterLink}
            to="/signin"
            variant="outlined"
            startIcon={<EventAvailableIcon />}
            sx={{ minHeight: 44 }}
          >
            簽到月曆
          </Button>
          <Button
            component={RouterLink}
            to="/gacha/exchange"
            variant="outlined"
            startIcon={<StorefrontIcon />}
            sx={{ minHeight: 44 }}
          >
            轉蛋商店
          </Button>
          <Button
            component={RouterLink}
            to="/trade/market"
            variant="outlined"
            startIcon={<ShoppingBasketIcon />}
            sx={{ minHeight: 44 }}
          >
            角色交易所
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
