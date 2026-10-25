import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Avatar,
  Chip,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  LinearProgress,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PeopleIcon from "@mui/icons-material/People";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import useLiff from "../../context/useLiff";
import * as GroupAPI from "../../services/group";

/* ---------- helpers ---------- */
function processSignData(signDatas) {
  let dates = [];
  signDatas.forEach(data => {
    dates = [...dates, ...data.signDates];
  });
  dates = [...new Set(dates)].sort((a, b) => a - b);
  return { dates, members: signDatas };
}

/* ---------- SummaryBanner ---------- */
// 橫幅上的 Chip 用實底：半透明白疊在青色上，12px 文字對比只有約 3.4:1
const bannerChipSx = { bgcolor: "background.paper", color: "text.primary", fontWeight: 600 };

function SummaryBanner({ members, dates, month }) {
  const totalMembers = members.length;
  const totalSignIns = members.reduce((acc, m) => acc + m.signDates.length, 0);
  const perfectMembers =
    dates.length > 0 ? members.filter(m => m.signDates.length === dates.length).length : 0;

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
        <CalendarMonthIcon sx={{ fontSize: 48, color: "primary.contrastText" }} />
        <Box sx={{ color: "primary.contrastText", minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {month} 月簽到總覽
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mt: 0.5, flexWrap: "wrap" }}>
            <Chip
              icon={<PeopleIcon sx={{ color: "inherit !important" }} />}
              label={`${totalMembers} 位成員`}
              size="small"
              sx={bannerChipSx}
            />
            <Chip
              icon={<CheckCircleIcon sx={{ color: "inherit !important" }} />}
              label={`${totalSignIns} 次簽到`}
              size="small"
              sx={bannerChipSx}
            />
            <Chip
              icon={<EmojiEventsIcon sx={{ color: "inherit !important" }} />}
              label={`${perfectMembers} 人全勤`}
              size="small"
              sx={bannerChipSx}
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

/* ---------- MonthSelector ---------- */
function MonthSelector({ month, onChange }) {
  return (
    <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        選擇月份（不分年份）
      </Typography>
      <ToggleButtonGroup
        value={month}
        exclusive
        aria-label="選擇月份"
        onChange={(_, v) => v !== null && onChange(v)}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          "& .MuiToggleButton-root": {
            flex: "1 0 auto",
            minWidth: 44,
            minHeight: 44,
            borderRadius: "8px !important",
            border: "1px solid",
            borderColor: "divider",
            py: 0.5,
            px: 1,
            fontSize: "0.875rem",
            fontWeight: 600,
          },
        }}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <ToggleButton key={m} value={m}>
            {m}月
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {/* 後端目前只依月份篩選、沒有年份參數，所以不同年份的同一個月會合併在一起（標題已註明） */}
    </Paper>
  );
}

/* ---------- MemberSignRow ---------- */
function MemberSignRow({ member, dates, month, totalDates }) {
  const signCount = member.signDates.length;
  const pct = totalDates > 0 ? (signCount / totalDates) * 100 : 0;

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Avatar
          src={member.pictureUrl}
          alt={member.displayName}
          sx={{ width: 36, height: 36, fontSize: 14 }}
        >
          {member.displayName?.charAt(0)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              mb: 0.25,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {member.displayName}
            </Typography>
            <Chip
              label={`${signCount} / ${totalDates}`}
              size="small"
              color={signCount === totalDates && totalDates > 0 ? "success" : "default"}
              variant={signCount === totalDates && totalDates > 0 ? "filled" : "outlined"}
              sx={{ fontWeight: 600, fontSize: "0.75rem", height: 22 }}
            />
          </Box>
          <LinearProgress
            variant="determinate"
            value={pct}
            color={signCount === totalDates && totalDates > 0 ? "success" : "primary"}
            sx={{ height: 6, borderRadius: 3, mb: 1 }}
          />
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {dates.map(date => {
              const signed = member.signDates.includes(date);
              return (
                <Chip
                  key={date}
                  label={`${month}/${date}`}
                  size="small"
                  icon={
                    signed ? (
                      <CheckCircleIcon sx={{ fontSize: "14px !important" }} />
                    ) : (
                      <CancelIcon sx={{ fontSize: "14px !important" }} />
                    )
                  }
                  color={signed ? "success" : "default"}
                  variant={signed ? "filled" : "outlined"}
                  aria-label={`${month}/${date} ${signed ? "已簽到" : "未簽到"}`}
                  sx={{ fontSize: "0.75rem", height: 24 }}
                />
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* ---------- MemberList ---------- */
function MemberList({ members, dates, month }) {
  const sorted = useMemo(() => {
    return [...members].sort((a, b) => b.signDates.length - a.signDates.length);
  }, [members]);

  if (members.length === 0) {
    return (
      <Paper sx={{ p: { xs: 4, sm: 5 }, textAlign: "center", borderRadius: 3 }}>
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          本月尚無簽到資料
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, pb: 1.5 }}>
        成員簽到明細
      </Typography>
      {sorted.map((member, i) => (
        <Box key={member.displayName + i}>
          {i > 0 && <Divider />}
          <MemberSignRow member={member} dates={dates} month={month} totalDates={dates.length} />
        </Box>
      ))}
    </Paper>
  );
}

/* ---------- Loading skeleton ---------- */
function BattleSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Skeleton variant="rounded" height={110} animation="wave" />
      <Skeleton variant="rounded" height={80} animation="wave" />
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} variant="rounded" height={64} animation="wave" />
      ))}
    </Box>
  );
}

/* ---------- GroupBattle (main export) ---------- */
export default function GroupBattle() {
  const { groupId } = useParams();
  const { loggedIn: isLoggedIn } = useLiff();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [signDatas, setSignDatas] = useState([]);
  // loadedMonth：目前畫面上資料屬於哪個月。切月份載入期間，橫幅與明細仍是上一個月的內容，
  // 標題要跟著資料走，不能跟著選擇器先跳過去。
  const [loadedMonth, setLoadedMonth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    document.title = "三刀簽到表";
  }, []);

  useEffect(() => {
    // 沒登入就不要打 API（會白白拿到 401），登入後 isLoggedIn 變動會重新觸發
    if (!isLoggedIn) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    GroupAPI.getSignList(groupId, month)
      .then(result => {
        if (cancelled) return;
        setSignDatas(result);
        setLoadedMonth(month);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, groupId, isLoggedIn, retryTick]);

  const retry = useCallback(() => setRetryTick(t => t + 1), []);

  const { dates, members } = useMemo(() => processSignData(signDatas), [signDatas]);

  if (!isLoggedIn) return <AlertLogin />;

  const hasData = loadedMonth !== null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {!hasData && loading && <BattleSkeleton />}

      {hasData && !loadError && (
        <SummaryBanner members={members} dates={dates} month={loadedMonth} />
      )}

      {(hasData || loadError) && <MonthSelector month={month} onChange={setMonth} />}

      {loadError && (
        <LoadError message="簽到資料載入失敗，請檢查網路後再試一次。" onRetry={retry} />
      )}

      {hasData && !loadError && (
        <Box aria-busy={loading} sx={{ position: "relative" }}>
          {/* 換月份時版面不動，只在明細上方顯示進度並淡化舊資料 */}
          {loading && (
            <LinearProgress
              aria-label="載入簽到資料中"
              sx={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1, borderRadius: 3 }}
            />
          )}
          <Box sx={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
            <MemberList members={members} dates={dates} month={loadedMonth} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
