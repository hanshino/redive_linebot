import { useEffect, useState } from "react";
import {
  Box,
  Container,
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  Stack,
  Typography,
} from "@mui/material";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import api from "../../services/api";
import EventList from "./EventList";
import DailyTrend from "./DailyTrend";
import { groupLabel as defaultGroupLabel } from "./groupLabel";

const TODAY = () => new Date().toISOString().slice(0, 10);

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function XpHistory() {
  const { loggedIn } = useLiff();

  const [tab, setTab] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const [events, setEvents] = useState([]);
  const [eventsRange] = useState({ from: addDays(TODAY(), -1), to: TODAY() });
  const [days, setDays] = useState([]);
  const [dailyRange, setDailyRange] = useState(30);

  useEffect(() => {
    document.title = "經驗歷程";
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    api
      .get(`/api/me/xp-events?from=${eventsRange.from}&to=${eventsRange.to}`)
      .then(res => setEvents(Array.isArray(res.data.events) ? res.data.events : []));
  }, [loggedIn, eventsRange]);

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
        <Typography variant="h6">經驗歷程</Typography>
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

      {tab === 0 && (
        <Box>
          <EventList events={events} showAll={showAll} groupLabel={defaultGroupLabel} />
        </Box>
      )}
      {tab === 1 && (
        <Box>
          <DailyTrend days={days} range={dailyRange} onRangeChange={setDailyRange} />
        </Box>
      )}
    </Container>
  );
}
