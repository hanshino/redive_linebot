import { useState, useEffect, useCallback } from "react";
import {
  Drawer,
  Toolbar,
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Chip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import LoadError from "../../../components/LoadError";
import * as couponService from "../../../services/coupon";

export default function CouponStatsDrawer({ couponId, onClose }) {
  const theme = useTheme();
  const [data, setData] = useState(null);
  // 載入失敗要跟載入中分開，否則骨架會一直轉
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setData(null);
    setError(false);
    if (couponId == null) return;
    let alive = true;
    couponService
      .fetchCoupon(couponId)
      .then(d => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [couponId, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  const daily = data?.dailyRedemptions || [];
  // 給螢幕閱讀器的圖表摘要：總領取與最近有資料的幾天
  const chartSummary = daily.length
    ? `每日領取長條圖，共 ${daily.length} 天有領取。${daily
        .slice(-5)
        .map(d => `${d.date} 領取 ${d.count} 次`)
        .join("，")}。`
    : "";

  return (
    <Drawer anchor="right" open={couponId != null} onClose={onClose}>
      <Toolbar />
      <Box sx={{ width: { xs: 320, sm: 420 }, p: 3 }}>
        {error ? (
          <LoadError message="領取資料載入失敗，請檢查網路後再試一次。" onRetry={retry} />
        ) : !data ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <>
            <Typography variant="h6" sx={{ fontFamily: "monospace" }}>
              {data.code}
            </Typography>
            <Chip label={`總領取 ${data.redeemedCount}`} color="primary" sx={{ mt: 1 }} />

            <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>
              每日領取
            </Typography>
            {daily.length ? (
              <Box role="img" aria-label={chartSummary}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
                    <XAxis dataKey="date" tick={{ fill: theme.palette.text.secondary }} />
                    <YAxis allowDecimals={false} tick={{ fill: theme.palette.text.secondary }} />
                    <Tooltip
                      contentStyle={{
                        background: theme.palette.background.paper,
                        border: `1px solid ${theme.palette.divider}`,
                        color: theme.palette.text.primary,
                      }}
                    />
                    {/* primary.light 是圖表用的亮青，兩種主題都看得清楚 */}
                    <Bar dataKey="count" name="領取次數" fill={theme.palette.primary.light} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Typography sx={{ color: "text.secondary" }}>尚無領取</Typography>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              最近領取（最多 100）
            </Typography>
            <List dense>
              {data.redemptions.map(r => (
                <ListItem key={`${r.user_id}-${r.created_at}`} disableGutters>
                  <ListItemText
                    primary={`${r.user_id.slice(0, 8)}…`}
                    secondary={new Date(r.created_at).toLocaleString()}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Box>
    </Drawer>
  );
}
