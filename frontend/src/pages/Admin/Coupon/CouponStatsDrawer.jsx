import { useState, useEffect } from "react";
import {
  Drawer,
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Chip,
} from "@mui/material";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import * as couponService from "../../../services/coupon";

export default function CouponStatsDrawer({ couponId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (couponId == null) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    couponService
      .fetchCoupon(couponId)
      .then(d => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [couponId]);

  return (
    <Drawer anchor="right" open={couponId != null} onClose={onClose}>
      <Box sx={{ width: { xs: 320, sm: 420 }, p: 3 }}>
        {loading || !data ? (
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
            {data.dailyRedemptions.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.dailyRedemptions}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary">尚無領取</Typography>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              最近領取（最多 100）
            </Typography>
            <List dense>
              {data.redemptions.map((r, i) => (
                <ListItem key={i} disableGutters>
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
