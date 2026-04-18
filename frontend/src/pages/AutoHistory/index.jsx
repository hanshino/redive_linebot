import { useEffect, useMemo, useState } from "react";
import { Box, Card, CardContent, Chip, Paper, Skeleton, Stack, Typography } from "@mui/material";
import CasinoIcon from "@mui/icons-material/Casino";
import SportsMmaIcon from "@mui/icons-material/SportsMma";
import HistoryIcon from "@mui/icons-material/History";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { getHistory } from "../../services/autoPreference";

function formatDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusColor(status) {
  if (status === "success") return "success";
  if (status === "failed") return "error";
  if (status === "skipped") return "default";
  if (status === "submitted") return "info";
  return "default";
}

function summaryText(item) {
  if (item.type === "gacha") {
    const s = item.summary || {};
    const rare = s.reward_summary?.rareCount || {};
    const parts = [];
    if (rare["3"]) parts.push(`${rare["3"]} 彩`);
    if (rare["2"]) parts.push(`${rare["2"]} 金`);
    if (rare["1"]) parts.push(`${rare["1"]} 銀`);
    if (s.reward_summary?.newCharactersCount)
      parts.push(`新角 ${s.reward_summary.newCharactersCount}`);
    if (s.error) return `(${s.error})`;
    return parts.length ? parts.join(" / ") : "（無詳細資料）";
  }
  if (item.type === "janken") {
    const { role, choice } = item.summary || {};
    const mapping = { rock: "✊", paper: "🖐️", scissors: "✌️" };
    return `${role?.toUpperCase() || ""} 代出 ${mapping[choice] || choice}`;
  }
  return "";
}

function HistoryItemCard({ item }) {
  const Icon = item.type === "gacha" ? CasinoIcon : SportsMmaIcon;
  return (
    <Card>
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Icon color={item.type === "gacha" ? "primary" : "secondary"} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.type === "gacha" ? "每日自動抽卡" : "猜拳自動出手"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {summaryText(item)}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={item.status}
            color={statusColor(item.status)}
            variant={item.status === "submitted" ? "outlined" : "filled"}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
      <HistoryIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
      <Typography color="text.secondary">尚無自動行為紀錄</Typography>
    </Paper>
  );
}

function HistorySkeleton() {
  return (
    <Stack spacing={1.5}>
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} variant="rounded" height={64} animation="wave" />
      ))}
    </Stack>
  );
}

export default function AutoHistory() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    document.title = "自動行為紀錄";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setLoading(true);
    getHistory({ limit: 30, type: "all" })
      .then(data => {
        if (cancelled) return;
        setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const day = formatDay(it.occurred_at);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  if (!isLoggedIn) return <AlertLogin />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.secondary.dark} 0%, ${theme.palette.secondary.main} 100%)`,
          color: "#fff",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <HistoryIcon sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              自動行為紀錄
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              最近 30 天的自動抽卡與自動猜拳紀錄。
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {loading ? (
        <HistorySkeleton />
      ) : grouped.length === 0 ? (
        <EmptyState />
      ) : (
        <Stack spacing={2.5}>
          {grouped.map(([day, entries]) => (
            <Box key={day}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", mb: 1, letterSpacing: 1 }}
              >
                {day}
              </Typography>
              <Stack spacing={1.5}>
                {entries.map((it, idx) => (
                  <HistoryItemCard key={`${day}-${idx}`} item={it} />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
