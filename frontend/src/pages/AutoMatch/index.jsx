import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import SportsMmaIcon from "@mui/icons-material/SportsMma";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { getAutoMatchToday } from "../../services/janken";

const HAND = { rock: "✊", paper: "🖐️", scissors: "✌️" };
const HAND_LABEL = { rock: "石頭", paper: "布", scissors: "剪刀" };

const RESULT_VIEW = {
  win: { label: "勝", color: "success", headline: "你贏了這一場" },
  lose: { label: "負", color: "error", headline: "這一場輸了" },
  draw: { label: "平手", color: "default", headline: "平手" },
};

// 後端 status + reason 的對照。每個 reason 各自成句，不把「今日輪空」「該場未完成」
// 「全站未執行」「沒被排入」混成同一種說法。
const STATE_VIEW = {
  "not_executed:waiting_for_schedule": {
    chip: { label: "等待中", color: "primary" },
    headline: "今晚 21:00 配對",
    lines: [
      "配對結果會在台灣時間 21:00 之後出現在這一頁。",
      "每人每天最多一場自動對戰，不佔用手動猜拳場數。雙方出拳由系統隨機決定。",
    ],
    countdown: true,
  },
  "not_executed:run_not_executed": {
    chip: { label: "未執行", color: "default" },
    headline: "今日未執行",
    lines: [
      "今天還沒有這一次全站配對的執行紀錄，所有人都沒有被配對。",
      "不扣女神石、不留戰績，這一場不補打。下一次排定配對為明天 21:00。",
    ],
  },
  "not_executed:not_in_run": {
    chip: { label: "未納入", color: "default" },
    headline: "今天沒有被排入配對",
    lines: [
      "今天的全站配對有執行，但你沒有在這一次的名單裡。",
      "不扣女神石、不留戰績。明天仍符合資格且已開啟參與的話會重新排入。",
    ],
  },
  "not_executed:not_participating": {
    chip: { label: "未參與", color: "default" },
    headline: "尚未參與自動配對",
    lines: ["你還沒有開啟「參與每日自動配對」，所以不會被排入 21:00 的配對。"],
    settingsCta: true,
  },
  "bye:no_opponent": {
    chip: { label: "輪空", color: "warning" },
    headline: "今日輪空",
    lines: [
      "今天沒有配到對手，不扣女神石、不留戰績。",
      "明天仍符合資格且已開啟參與的話，會依配對優先序優先排入。",
      "輪空不影響手動猜拳，也不佔用明天的名額。",
    ],
  },
  "failed:match_failed": {
    chip: { label: "未完成", color: "error" },
    headline: "這一場未完成",
    lines: [
      "配對成功，但這一場沒有完成，不扣女神石、不留戰績，也不補打。",
      "這一場仍計入今天的自動配對名額。這與「今日輪空」不同：輪空是沒有配到對手。",
    ],
  },
  // 這個狀態同時可能是「當次 run 還在跑、尚未結算」與「hard crash 後不再推進」。
  // 兩邊都不能斷言：不說處理中／稍後會完成，也不說已失敗／未扣款。
  // 只講此刻為真、且兩種情況都成立的事實。
  "failed:not_started": {
    chip: { label: "尚無結算", color: "default" },
    headline: "尚無完成的結算結果",
    lines: [
      "今天已為你排定一場自動對戰，目前沒有可顯示的結算結果。",
      "系統不會另開一場補打；今天的自動配對名額已保留。",
    ],
  },
  "failed:result_unavailable": {
    chip: { label: "暫無資料", color: "warning" },
    headline: "結算資料暫時無法載入",
    lines: ["今天這一場的結算內容目前讀不到，稍後再回來看看。"],
  },
  "failed:invalid_manifest_status": {
    chip: { label: "狀態異常", color: "warning" },
    headline: "這一場的狀態無法判讀",
    lines: ["今天這一場的狀態目前無法正常顯示，稍後再回來查看。"],
  },
};

function formatStones(n) {
  return Number(n || 0).toLocaleString("en-US");
}

// 後端對 profile 缺失固定回字串 "unknown"，直接顯示會是英文；換成自然中文。
function opponentName(displayName) {
  if (!displayName || displayName === "unknown") return "未知玩家";
  return displayName;
}

/** 距離下一個台灣時間 21:00 的 hh:mm:ss。 */
function untilSchedule() {
  const now = new Date();
  const tpe = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const target = new Date(tpe);
  target.setHours(21, 0, 0, 0);
  if (tpe >= target) target.setDate(target.getDate() + 1);
  const total = Math.max(0, Math.floor((target - tpe) / 1000));
  const pad = n => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function Countdown() {
  const [text, setText] = useState(untilSchedule);
  useEffect(() => {
    const id = setInterval(() => setText(untilSchedule()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Typography
      variant="h4"
      sx={{ fontWeight: 700, mt: 1.5, fontVariantNumeric: "tabular-nums", letterSpacing: 1 }}
    >
      {text}
    </Typography>
  );
}

function Side({ name, pictureUrl, choice, highlight }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        textAlign: "center",
        p: 2,
        borderRadius: 3,
        border: 1,
        borderColor: "divider",
        bgcolor: theme =>
          highlight
            ? theme.palette.mode === "dark"
              ? "rgba(38,198,218,0.10)"
              : "rgba(0,172,193,0.06)"
            : "transparent",
      }}
    >
      <Avatar src={pictureUrl || undefined} sx={{ width: 48, height: 48, mx: "auto" }}>
        {name?.[0] || "?"}
      </Avatar>
      <Typography variant="body2" noWrap sx={{ fontWeight: 600, mt: 1 }}>
        {name}
      </Typography>
      <Typography sx={{ fontSize: 32, lineHeight: 1.4, mt: 1 }}>{HAND[choice] || "—"}</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {HAND_LABEL[choice] || choice || "未知"}
      </Typography>
    </Box>
  );
}

function MetaRow({ label, children }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
      <Typography variant="caption" sx={{ color: "text.secondary", width: "6.2em", flex: "none" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ minWidth: 0 }}>
        {children}
      </Typography>
    </Stack>
  );
}

function MatchCard({ runDate, match }) {
  const view = RESULT_VIEW[match.result] || { label: match.result, color: "default", headline: "" };
  const s = match.settlement || {};
  const betAmount = Number(s.betAmount || 0);
  const isBet = betAmount > 0;

  return (
    <Card>
      <CardContent>
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
          今日結果
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mt: 0.5 }}>
          <Chip size="small" label={view.label} color={view.color} />
          <Chip size="small" variant="outlined" label={`${runDate} 21:00`} />
        </Stack>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1.5 }}>
          {view.headline}
        </Typography>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "stretch", mt: 2.5 }}>
          <Side name="我" choice={match.choice} highlight />
          <Typography
            variant="caption"
            sx={{ alignSelf: "center", color: "text.secondary", fontWeight: 700, letterSpacing: 1 }}
          >
            VS
          </Typography>
          <Side
            name={opponentName(match.opponent?.displayName)}
            pictureUrl={match.opponent?.pictureUrl}
            choice={match.opponentChoice}
          />
        </Stack>

        <Stack spacing={1} sx={{ mt: 2.5 }}>
          <MetaRow label="下注">
            {isBet
              ? `雙方同意 · ${formatStones(betAmount)} 女神石`
              : "本場不下注（雙方未都同意，或女神石不足）"}
          </MetaRow>
          {isBet && Number(s.fee || 0) > 0 && (
            <MetaRow label="手續費">{formatStones(s.fee)} 女神石</MetaRow>
          )}
          {s.eloChange !== null && s.eloChange !== undefined && (
            <MetaRow label="ELO">{`+${Number(s.eloChange)}`}</MetaRow>
          )}
          {s.streakBroken !== null && s.streakBroken !== undefined && (
            <MetaRow label="中斷連勝">{`${Number(s.streakBroken)} 連勝`}</MetaRow>
          )}
          {Number(s.bountyWon || 0) > 0 && (
            <MetaRow label="懸賞">{formatStones(s.bountyWon)} 女神石</MetaRow>
          )}
          <MetaRow label="對手資訊">僅顯示暱稱與頭像</MetaRow>
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
          {isBet
            ? "結算沿用手動對戰的同一套規則，沒有額外費率或加成。"
            : "不下注的場次不更新 ELO、連勝與懸賞。"}
        </Typography>
      </CardContent>
    </Card>
  );
}

function StateCard({ view }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
          今日結果
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <Chip size="small" label={view.chip.label} color={view.chip.color} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1.5 }}>
          {view.headline}
        </Typography>
        {view.countdown && <Countdown />}
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {view.lines.map(line => (
            <Typography key={line} variant="body2" sx={{ color: "text.secondary" }}>
              {line}
            </Typography>
          ))}
        </Stack>
        {view.settingsCta && (
          <Button
            component={RouterLink}
            to="/auto/settings"
            variant="contained"
            startIcon={<SettingsIcon />}
            sx={{ mt: 2.5 }}
          >
            前往自動設定
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function UnknownStateCard({ data }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 1 }}>
          今日結果
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
          目前無法顯示今天的狀態
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
          今天這一場回報的狀態（{data.status}）目前無法正常顯示，稍後再回來查看。
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function AutoMatch() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    document.title = "今日自動配對";
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData(await getAutoMatchToday());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    reload();
  }, [isLoggedIn, reload]);

  if (!isLoggedIn) return <AlertLogin />;

  const key = data ? `${data.status}:${data.reason}` : null;
  const stateView = key ? STATE_VIEW[key] : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          color: "#fff",
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <SportsMmaIcon sx={{ fontSize: 32 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              今日自動配對
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              每天台灣時間 21:00 全站配對一次，結果只在這裡顯示。
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/auto/settings"
            size="small"
            variant="outlined"
            startIcon={<SettingsIcon />}
            sx={{
              color: "#fff",
              borderColor: "rgba(255,255,255,0.6)",
              whiteSpace: "nowrap",
              "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.08)" },
            }}
          >
            設定
          </Button>
        </Stack>
      </Paper>

      {loading && <Skeleton variant="rounded" height={280} animation="wave" />}

      {!loading && error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reload}>
              重試
            </Button>
          }
        >
          讀取今日自動配對結果失敗
        </Alert>
      )}

      {!loading && !error && data && (
        <>
          {data.status === "completed" && data.match ? (
            <MatchCard runDate={data.run_date} match={data.match} />
          ) : stateView ? (
            <StateCard view={stateView} />
          ) : (
            <UnknownStateCard data={data} />
          )}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            結果只在這個頁面查看，不會發送群組通知。
          </Typography>
        </>
      )}
    </Box>
  );
}
