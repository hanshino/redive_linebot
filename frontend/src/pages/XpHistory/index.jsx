import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Container,
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  Stack,
  Typography,
  IconButton,
  Drawer,
  Divider,
  Link,
  Skeleton,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import api from "../../services/api";
import { fetchGroupSummarys } from "../../services/group";
import EventList from "./EventList";
import DailyTrend from "./DailyTrend";
import TodayHeader from "./TodayHeader";
import TodayWeather from "./TodayWeather";
import { makeGroupLabel } from "./groupLabel";
import { addDaysTpe, todayTpe } from "./dateTpe";
import useApiData from "./useApiData";

const GLOSSARY = [
  { term: "原始 XP", body: "每則訊息的帳面值（基礎 × 冷卻 × 群組 × 暖流）。" },
  { term: "實得 XP", body: "實際入帳。原始 XP 經今日累積遞減，再套蜜月、試煉、永久。" },
  {
    term: "遞減階段",
    body: "今日累積：0–400 ×1.0、400–1000 ×0.3、≥1000 ×0.03（祝福 #4 / #5 可放寬上限）。",
  },
  { term: "蜜月", body: "轉生次數 = 0 時自動 ×1.2，轉生一次後解除。" },
  { term: "試煉", body: "★2 ×0.7、★5 ×0.5；★3 拉長冷卻、★4 關閉群組加成。" },
  { term: "永久", body: "轉生獎勵或活動發出的永久 XP 加成，可累加。" },
];

export default function XpHistory() {
  const { loggedIn } = useLiff();

  const [tab, setTab] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [dailyRange, setDailyRange] = useState(30);
  const [groupNames, setGroupNames] = useState({});

  useEffect(() => {
    document.title = "經驗歷程";
  }, []);

  // 逐筆與每日趨勢各自有 loading / 失敗 / 空資料三態：失敗不能顯示成「沒有資料」。
  const {
    data: events,
    loading: eventsLoading,
    error: eventsError,
    reload: reloadEvents,
  } = useApiData(
    () => {
      const to = todayTpe();
      const from = addDaysTpe(to, -1);
      return api
        .get(`/api/me/xp-events?from=${from}&to=${to}`)
        .then(res => (Array.isArray(res.data.events) ? res.data.events : []));
    },
    loggedIn,
    [loggedIn]
  );

  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
    reload: reloadSummary,
  } = useApiData(
    () => api.get("/api/me/xp-summary").then(res => res.data?.today || null),
    loggedIn,
    [loggedIn]
  );

  useEffect(() => {
    if (!loggedIn) return;
    fetchGroupSummarys()
      .then(list => {
        const map = {};
        (Array.isArray(list) ? list : []).forEach(g => {
          if (g?.groupId && g?.groupName) map[g.groupId] = g.groupName;
        });
        setGroupNames(map);
      })
      .catch(() => setGroupNames({}));
  }, [loggedIn]);

  const groupLabel = useMemo(() => makeGroupLabel(groupNames), [groupNames]);

  const {
    data: days,
    loading: daysLoading,
    error: daysError,
    reload: reloadDays,
  } = useApiData(
    () => {
      const to = todayTpe();
      const from = addDaysTpe(to, -(dailyRange - 1));
      return api
        .get(`/api/me/xp-daily?from=${from}&to=${to}`)
        .then(res => (Array.isArray(res.data.days) ? res.data.days : []));
    },
    loggedIn,
    [loggedIn, dailyRange]
  );

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
          <Typography variant="h6">經驗歷程</Typography>
          <IconButton
            onClick={() => setHelpOpen(true)}
            aria-label="名詞說明"
            sx={{ color: "text.secondary", width: 44, height: 44 }}
          >
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>
        {tab === 0 && (
          <FormControlLabel
            control={
              <Switch size="small" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            }
            label="顯示全部乘數"
          />
        )}
      </Stack>

      {!loggedIn && <AlertLogin />}

      {loggedIn && (
        <Box sx={{ mb: 2 }}>
          <TodayWeather />
        </Box>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="逐筆" />
        <Tab label="每日趨勢" />
      </Tabs>

      {tab === 0 && (
        <Stack sx={{ gap: 1.75 }}>
          {summaryLoading ? (
            <Skeleton variant="rounded" height={148} animation="wave" />
          ) : summaryError ? (
            <LoadError message="今日經驗載入失敗，請檢查網路後再試一次。" onRetry={reloadSummary} />
          ) : (
            <TodayHeader summary={summary} />
          )}
          <Typography
            sx={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12,
              letterSpacing: "0.1em",
              color: "text.secondary",
              pl: 0.5,
            }}
          >
            訊息事件
          </Typography>
          {!loggedIn ? null : eventsLoading ? (
            <Stack sx={{ gap: 1 }}>
              {[0, 1, 2].map(i => (
                <Skeleton key={i} variant="rounded" height={64} animation="wave" />
              ))}
            </Stack>
          ) : eventsError ? (
            <LoadError message="經驗紀錄載入失敗，請檢查網路後再試一次。" onRetry={reloadEvents} />
          ) : (
            <EventList
              events={events}
              showAll={showAll}
              groupLabel={groupLabel}
              defaultExpanded="first"
            />
          )}
        </Stack>
      )}
      {tab === 1 && (
        <Stack sx={{ gap: 1.5 }}>
          <DailyTrend
            days={days}
            range={dailyRange}
            onRangeChange={setDailyRange}
            loading={daysLoading}
            error={daysError}
            onRetry={reloadDays}
          />
          <Box
            sx={{
              p: 1.5,
              bgcolor: "background.paper",
              borderRadius: 1.5,
              border: 1,
              borderColor: "divider",
              fontSize: 12,
              color: "text.secondary",
              lineHeight: 1.7,
            }}
          >
            金黃 = 實得 XP；灰 = 遞減或試煉扣掉的部分。背景綠色是蜜月，琥珀色是試煉中。
          </Box>
        </Stack>
      )}

      <Drawer
        anchor="bottom"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        slotProps={{
          paper: { sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, p: 2 } },
        }}
      >
        <Box
          sx={{ width: 40, height: 4, bgcolor: "divider", borderRadius: 2, mx: "auto", mb: 2 }}
        />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          名詞速查
        </Typography>
        <Stack sx={{ gap: 1.25 }}>
          {GLOSSARY.map(g => (
            <Box key={g.term} sx={{ display: "flex", gap: 1.25, alignItems: "baseline" }}>
              <Box sx={{ minWidth: 80, fontWeight: 600 }}>{g.term}</Box>
              <Box sx={{ flex: 1, color: "text.secondary", fontSize: 13, lineHeight: 1.6 }}>
                {g.body}
              </Box>
            </Box>
          ))}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Box sx={{ textAlign: "right" }}>
          <Link
            component={RouterLink}
            to="/xp-history/about"
            onClick={() => setHelpOpen(false)}
            underline="hover"
          >
            詳細計算說明 →
          </Link>
        </Box>
      </Drawer>
    </Container>
  );
}
