import { useState, useEffect, useMemo } from "react";
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
        <CalendarMonthIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.8)" }} />
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {month} 月簽到總覽
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mt: 0.5, flexWrap: "wrap" }}>
            <Chip
              icon={<PeopleIcon sx={{ color: "inherit !important" }} />}
              label={`${totalMembers} 位成員`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              icon={<CheckCircleIcon sx={{ color: "inherit !important" }} />}
              label={`${totalSignIns} 次簽到`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              icon={<EmojiEventsIcon sx={{ color: "inherit !important" }} />}
              label={`${perfectMembers} 人全勤`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
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
        選擇月份
      </Typography>
      <ToggleButtonGroup
        value={month}
        exclusive
        onChange={(_, v) => v !== null && onChange(v)}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          "& .MuiToggleButton-root": {
            flex: "1 0 auto",
            minWidth: 44,
            borderRadius: "8px !important",
            border: "1px solid",
            borderColor: "divider",
            py: 0.5,
            px: 1,
            fontSize: "0.85rem",
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
                  sx={{ fontSize: "0.7rem", height: 22, opacity: signed ? 1 : 0.5 }}
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
  const isLoggedIn = window.liff?.isLoggedIn?.() ?? false;
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [signDatas, setSignDatas] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "三刀簽到表";
  }, []);

  useEffect(() => {
    setLoading(true);
    GroupAPI.getSignList(groupId, month)
      .then(result => setSignDatas(result))
      .catch(() => setSignDatas([]))
      .finally(() => setLoading(false));
  }, [month, groupId]);

  const { dates, members } = useMemo(() => processSignData(signDatas), [signDatas]);

  if (!isLoggedIn) return <AlertLogin />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {loading ? (
        <BattleSkeleton />
      ) : (
        <>
          <SummaryBanner members={members} dates={dates} month={month} />
          <MonthSelector month={month} onChange={setMonth} />
          <MemberList members={members} dates={dates} month={month} />
        </>
      )}
    </Box>
  );
}
