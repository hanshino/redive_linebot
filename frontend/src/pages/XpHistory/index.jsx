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
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import api from "../../services/api";
import { fetchGroupSummarys } from "../../services/group";
import EventList from "./EventList";
import DailyTrend from "./DailyTrend";
import { makeGroupLabel } from "./groupLabel";

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

// Backend day boundary is Asia/Taipei (UTC+8); see XpHistoryService.todayDateUtc8.
const DATE_FMT_TPE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const TODAY = () => DATE_FMT_TPE.format(new Date());

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return DATE_FMT_TPE.format(d);
}

export default function XpHistory() {
  const { loggedIn } = useLiff();

  const [tab, setTab] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [events, setEvents] = useState([]);
  const [days, setDays] = useState([]);
  const [dailyRange, setDailyRange] = useState(30);
  const [groupNames, setGroupNames] = useState({});

  useEffect(() => {
    document.title = "經驗歷程";
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const to = TODAY();
    const from = addDays(to, -1);
    api
      .get(`/api/me/xp-events?from=${from}&to=${to}`)
      .then(res => setEvents(Array.isArray(res.data.events) ? res.data.events : []));
  }, [loggedIn]);

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

  useEffect(() => {
    if (!loggedIn) return;
    const to = TODAY();
    const from = addDays(to, -(dailyRange - 1));
    api
      .get(`/api/me/xp-daily?from=${from}&to=${to}`)
      .then(res => setDays(Array.isArray(res.data.days) ? res.data.days : []));
  }, [loggedIn, dailyRange]);

  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Typography variant="h6">經驗歷程</Typography>
          <IconButton
            size="small"
            onClick={() => setHelpOpen(true)}
            aria-label="名詞說明"
            sx={{ color: "text.secondary" }}
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

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="逐筆" />
        <Tab label="每日趨勢" />
      </Tabs>

      {tab === 0 && <EventList events={events} showAll={showAll} groupLabel={groupLabel} />}
      {tab === 1 && <DailyTrend days={days} range={dailyRange} onRangeChange={setDailyRange} />}

      <Drawer
        anchor="bottom"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        PaperProps={{ sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, p: 2 } }}
      >
        <Box
          sx={{ width: 40, height: 4, bgcolor: "divider", borderRadius: 2, mx: "auto", mb: 2 }}
        />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          名詞速查
        </Typography>
        <Stack gap={1.25}>
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
