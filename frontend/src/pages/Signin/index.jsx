import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import CheckIcon from "@mui/icons-material/Check";
import DiamondIcon from "@mui/icons-material/Diamond";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import TodayIcon from "@mui/icons-material/Today";
import api from "../../services/api";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";

// Backend day boundary is Asia/Taipei (UTC+8) — same convention as
// pages/XpHistory/dateTpe.js. Parse the API's ISO date at +08:00 and read the
// weekday back in that zone so the grid never drifts a day on other locales.
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  weekday: "short",
});
const FULL_DATE_FMT = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "long",
  day: "numeric",
  weekday: "long",
});

function tpeInstant(date) {
  const d = new Date(`${date}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function weekdayIndexTpe(date) {
  const d = tpeInstant(date);
  return d ? (WEEKDAY_INDEX[WEEKDAY_FMT.format(d)] ?? 0) : 0;
}

function fullDateLabel(date) {
  const d = tpeInstant(date);
  return d ? FULL_DATE_FMT.format(d) : date;
}

const pad = n => String(n).padStart(2, "0");
const num = n => Number(n || 0).toLocaleString();

// date strings are zero-padded ISO, so lexical compare == chronological compare
const STATUS = {
  signed: { label: "已簽到", icon: CheckIcon },
  makeup: { label: "補簽", icon: AutoFixHighIcon },
  missed: { label: "可補簽", icon: AddIcon },
  today: { label: "今天", icon: TodayIcon },
  future: { label: "未到", icon: null },
};

const ERROR_MSG = {
  INVALID_DATE: "日期格式不正確。",
  NOT_CURRENT_MONTH: "只能補簽本月的日期。",
  DATE_NOT_PAST: "只能補簽已經過去的日期。",
  INSUFFICIENT_STONES: "女神石不足，無法補簽。",
  ALREADY_SIGNED: "這天已經簽到了，已為你重新整理。",
};

/* ---------- day cell ---------- */

function dayCellSx(status, isToday) {
  const base = {
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 0.15,
    border: "1px solid",
    transition: "transform .18s ease-out, box-shadow .18s ease-out, border-color .18s ease-out",
    ...(isToday && {
      outline: "2px solid",
      outlineColor: "primary.main",
      outlineOffset: 2,
    }),
  };

  if (status === "signed") {
    return {
      ...base,
      bgcolor: "primary.main",
      borderColor: "primary.main",
      color: "primary.contrastText",
    };
  }
  if (status === "makeup") {
    return {
      ...base,
      bgcolor: "secondary.main",
      borderStyle: "dashed",
      borderWidth: 2,
      borderColor: "secondary.dark",
      color: "secondary.contrastText",
    };
  }
  if (status === "missed") {
    return {
      ...base,
      borderStyle: "dashed",
      borderWidth: 2,
      borderColor: "divider",
      color: "text.secondary",
      bgcolor: "action.hover",
      "&:hover": {
        borderColor: "secondary.main",
        color: "secondary.main",
        transform: "translateY(-2px)",
        boxShadow: 3,
      },
      "&:active": { transform: "translateY(0)" },
      "&.Mui-focusVisible": { borderColor: "secondary.main", color: "secondary.main" },
    };
  }
  if (status === "today") {
    return { ...base, borderColor: "primary.main", color: "primary.main", bgcolor: "transparent" };
  }
  return { ...base, borderColor: "transparent", color: "text.disabled", opacity: 0.55 };
}

function DayCell({ cell, isToday, onPick }) {
  const { day, date, status } = cell;
  const meta = STATUS[status];
  const Icon = meta.icon;
  const actionable = status === "missed";

  const body = (
    <>
      <Typography
        component="span"
        sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 700, lineHeight: 1 }}
      >
        {day}
      </Typography>
      {Icon ? (
        <Icon sx={{ fontSize: 13 }} />
      ) : (
        <Box component="span" sx={{ fontSize: 13, lineHeight: 1 }}>
          ·
        </Box>
      )}
    </>
  );

  const label = `${fullDateLabel(date)}，${isToday && status !== "signed" && status !== "makeup" ? "今天，尚未簽到" : meta.label}`;

  if (actionable) {
    return (
      <ButtonBase
        onClick={() => onPick(date)}
        aria-label={`${label}，點擊補簽`}
        sx={dayCellSx(status, isToday)}
      >
        {body}
      </ButtonBase>
    );
  }

  return (
    <Box role="listitem" aria-label={label} sx={dayCellSx(status, isToday)}>
      {body}
    </Box>
  );
}

/* ---------- stat tile ---------- */

function StatTile({ icon: Icon, label, value, unit, accent }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.75 }}>
          <Icon sx={{ fontSize: 16, color: accent }} />
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
            {label}
          </Typography>
        </Stack>
        <Typography component="p" sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
          {value}
          {unit && (
            <Typography
              component="span"
              variant="caption"
              sx={{ ml: 0.5, color: "text.secondary", fontWeight: 500 }}
            >
              {unit}
            </Typography>
          )}
        </Typography>
      </CardContent>
    </Card>
  );
}

/* ---------- legend ---------- */

const LEGEND = [
  { status: "signed", text: "已簽到" },
  { status: "makeup", text: "補簽" },
  { status: "missed", text: "可補簽" },
  { status: "today", text: "今天" },
  { status: "future", text: "未到" },
];

function Legend() {
  return (
    <Stack direction="row" spacing={1.25} sx={{ flexWrap: "wrap", rowGap: 1 }}>
      {LEGEND.map(({ status, text }) => {
        const Icon = STATUS[status].icon;
        return (
          <Stack key={status} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Box
              aria-hidden
              sx={{
                ...dayCellSx(status, false),
                width: 20,
                height: 20,
                aspectRatio: "auto",
                borderRadius: 1,
                flexShrink: 0,
                "&:hover": undefined,
              }}
            >
              {Icon ? <Icon sx={{ fontSize: 11 }} /> : null}
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {text}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

/* ---------- page ---------- */

export default function Signin() {
  const { loggedIn } = useLiff();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [target, setTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [hint, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  useEffect(() => {
    document.title = "每日簽到";
  }, []);

  // ponytail: `loading` only guards the first paint — refetches (retry /
  // ALREADY_SIGNED) keep the calendar on screen instead of flashing skeletons.
  const load = useCallback(() => {
    return api
      .get("/api/me/signins")
      .then(res => {
        setData(res.data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn, load]);

  const cells = useMemo(() => {
    if (!data) return [];
    const bySource = new Map((data.entries || []).map(e => [e.date, e.source]));
    return Array.from({ length: data.daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${data.month}-${pad(day)}`;
      const source = bySource.get(date);
      let status;
      if (source) status = source === "makeup" ? "makeup" : "signed";
      else if (date === data.today) status = "today";
      else if (date < data.today) status = "missed";
      else status = "future";
      return { day, date, status };
    });
  }, [data]);

  const cost = Number(data?.makeupCost || 0);
  const balance = Number(data?.godStoneBalance || 0);
  const affordable = balance >= cost;

  const openConfirm = date => {
    setDialogError("");
    setTarget(date);
  };

  const closeConfirm = () => {
    if (submitting) return;
    setTarget(null);
  };

  const submit = () => {
    setSubmitting(true);
    setDialogError("");
    api
      .post("/api/me/signins/makeup", { date: target })
      .then(res => {
        setData(res.data);
        setTarget(null);
        showHint(`已補簽 ${fullDateLabel(target)}`, "success");
      })
      .catch(err => {
        const code = err?.response?.data?.code;
        const message = ERROR_MSG[code] || err?.response?.data?.message || "補簽失敗，請稍後再試。";
        if (code === "ALREADY_SIGNED") {
          setTarget(null);
          showHint(message, "warning");
          load();
          return;
        }
        setDialogError(message);
      })
      .finally(() => setSubmitting(false));
  };

  if (!loggedIn) return <AlertLogin />;

  const leadingBlanks = data ? weekdayIndexTpe(`${data.month}-01`) : 0;
  const monthLabel = data ? Number(data.month.slice(5, 7)) : null;
  const stats = data?.stats || {};
  const progress = data?.daysInMonth ? ((stats.monthCount || 0) / data.daysInMonth) * 100 : 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, maxWidth: 720, mx: "auto" }}>
      {/* hero */}
      <Paper sx={{ position: "relative", overflow: "hidden", borderRadius: 3 }}>
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
            p: { xs: 2.5, sm: 3.5 },
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
            color: "#fff",
          }}
        >
          <EventAvailableIcon sx={{ fontSize: 44, color: "rgba(255,255,255,0.85)" }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {monthLabel ? `${monthLabel} 月簽到` : "每日簽到"}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.25 }}>
              錯過的日子可以用女神石補簽，只看得到本月。
            </Typography>
          </Box>
          {stats.fullMonth && (
            <Chip
              icon={<EmojiEventsIcon sx={{ color: "inherit !important" }} />}
              label="本月全勤"
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.22)", color: "#fff", fontWeight: 700 }}
            />
          )}
        </Box>
      </Paper>

      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={load}>
              重試
            </Button>
          }
        >
          載入簽到資料失敗，請稍後再試。
        </Alert>
      )}

      {loading && !data ? (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5 }}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} variant="rounded" height={86} animation="wave" />
            ))}
          </Box>
          <Skeleton variant="rounded" height={360} animation="wave" />
        </>
      ) : (
        data && (
          <>
            {/* stats */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
                gap: 1.5,
              }}
            >
              <StatTile
                icon={LocalFireDepartmentIcon}
                label="連續簽到"
                value={num(stats.streak)}
                unit="天"
                accent="error.main"
              />
              <StatTile
                icon={EventAvailableIcon}
                label="累計簽到"
                value={num(stats.total)}
                unit="天"
                accent="primary.main"
              />
              <StatTile
                icon={TodayIcon}
                label="本月簽到"
                value={`${num(stats.monthCount)} / ${data.daysInMonth}`}
                accent="info.main"
              />
              <StatTile
                icon={DiamondIcon}
                label="女神石"
                value={num(balance)}
                accent="secondary.main"
              />
            </Box>

            {/* calendar */}
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack
                  direction="row"
                  sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1.5 }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {data.month}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    補簽一次 {num(cost)} 女神石
                  </Typography>
                </Stack>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: { xs: 0.75, sm: 1 },
                    mb: 1,
                  }}
                >
                  {WEEKDAY_LABELS.map(w => (
                    <Typography
                      key={w}
                      variant="caption"
                      aria-hidden
                      sx={{
                        textAlign: "center",
                        color: "text.secondary",
                        fontWeight: 700,
                      }}
                    >
                      {w}
                    </Typography>
                  ))}
                </Box>

                <Box
                  role="list"
                  aria-label={`${data.month} 簽到月曆`}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: { xs: 0.75, sm: 1 },
                  }}
                >
                  {Array.from({ length: leadingBlanks }, (_, i) => (
                    <Box key={`blank-${i}`} aria-hidden />
                  ))}
                  {cells.map(cell => (
                    <DayCell
                      key={cell.date}
                      cell={cell}
                      isToday={cell.date === data.today}
                      onPick={openConfirm}
                    />
                  ))}
                </Box>

                <Divider sx={{ my: 2 }} />
                <Legend />

                <Box sx={{ mt: 2 }}>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: "space-between", mb: 0.5 }}
                    aria-hidden
                  >
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      本月進度
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {num(stats.monthCount)} / {data.daysInMonth} 天
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(progress, 100)}
                    aria-label="本月簽到進度"
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      "& .MuiLinearProgress-bar": { borderRadius: 3 },
                    }}
                  />
                </Box>
              </CardContent>
            </Card>

            {!affordable && (
              <Alert severity="info">
                女神石餘額 {num(balance)}，補簽一次需要 {num(cost)}，目前還無法補簽。
              </Alert>
            )}
          </>
        )
      )}

      {/* confirm — same shape as XpHistory/TodayWeather's purchase dialog */}
      <Dialog open={Boolean(target)} onClose={closeConfirm} fullWidth maxWidth="xs">
        <DialogTitle>補簽 {target ? fullDateLabel(target) : ""}？</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mb: 1.5 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                花費
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {num(cost)} 女神石
              </Typography>
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                補簽後餘額
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: affordable ? "text.primary" : "error.main" }}
              >
                {num(Math.max(balance - cost, 0))}
              </Typography>
            </Stack>
          </Stack>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: "action.hover",
              border: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" component="ul" sx={{ pl: 2, m: 0, lineHeight: 1.9 }}>
              <li>不會補發當天的每日轉蛋。</li>
              <li>會採計簽到相關成就。</li>
              <li>一次只能補一天。</li>
            </Typography>
          </Box>
          {!affordable && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              女神石不足，無法補簽。
            </Alert>
          )}
          {dialogError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {dialogError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirm} disabled={submitting}>
            取消
          </Button>
          <Button variant="contained" onClick={submit} disabled={submitting || !affordable}>
            {submitting ? "補簽中…" : "確定補簽"}
          </Button>
        </DialogActions>
      </Dialog>

      <HintSnackBar
        open={hint.open}
        message={hint.message}
        severity={hint.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
