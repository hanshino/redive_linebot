import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import useAxios from "axios-hooks";
import {
  Box,
  Grid,
  Typography,
  Paper,
  Card,
  CardContent,
  Avatar,
  Chip,
  LinearProgress,
  Skeleton,
  Divider,
} from "@mui/material";
import ForumIcon from "@mui/icons-material/Forum";
import ImageIcon from "@mui/icons-material/Image";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import ReplayIcon from "@mui/icons-material/Replay";
import PeopleIcon from "@mui/icons-material/People";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AlertLogin from "../../components/AlertLogin";

/* ---------- helpers ---------- */
const sum = (arr, key) => arr.reduce((acc, cur) => acc + (cur[key] || 0), 0);
const total = m => (m.textCnt || 0) + (m.imageCnt || 0) + (m.stickerCnt || 0);
const fmtDate = ts => {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const MEDAL_COLORS = ["#FFD700", "#A0A0A0", "#CD7F32"];

/* ---------- StatChip ---------- */
function StatChip({ icon, label, value }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {icon}
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
        }}
      >
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {value.toLocaleString()}
      </Typography>
    </Box>
  );
}

/* ---------- GroupBanner ---------- */
function GroupBanner({ group, rank }) {
  const memberCount = rank.length;
  const groupCount = group?.count || 0;
  const totalMessages = sum(rank, "textCnt") + sum(rank, "imageCnt") + sum(rank, "stickerCnt");

  return (
    <Paper
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
      }}
    >
      {group?.pictureUrl && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${group.pictureUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(20px) brightness(0.3)",
          }}
        />
      )}
      {!group?.pictureUrl && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: theme =>
              `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          }}
        />
      )}
      <Box
        sx={{
          position: "relative",
          p: { xs: 3, sm: 4 },
          display: "flex",
          alignItems: "center",
          gap: 2.5,
        }}
      >
        <Avatar
          src={group?.pictureUrl}
          alt={group?.groupName}
          sx={{ width: 72, height: 72, border: "3px solid rgba(255,255,255,0.3)" }}
        >
          {group?.groupName?.charAt(0)}
        </Avatar>
        <Box sx={{ color: "#fff", minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }} noWrap>
            {group?.groupName}
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mt: 0.5, flexWrap: "wrap" }}>
            <Chip
              icon={<PeopleIcon sx={{ color: "inherit !important" }} />}
              label={`${memberCount} / ${groupCount} 人`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
            <Chip
              icon={<ForumIcon sx={{ color: "inherit !important" }} />}
              label={`${totalMessages.toLocaleString()} 則訊息`}
              size="small"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "#fff" }}
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

/* ---------- TopContributors ---------- */
function TopContributors({ rank }) {
  const top3 = rank.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        <EmojiEventsIcon sx={{ fontSize: 20, verticalAlign: "text-bottom", mr: 0.5 }} />
        Top 活躍成員
      </Typography>
      <Grid container spacing={2}>
        {top3.map((member, i) => (
          <Grid size={{ xs: 12, sm: 4 }} key={member.userId}>
            <Card
              sx={{
                borderTop: `3px solid ${MEDAL_COLORS[i]}`,
                height: "100%",
              }}
            >
              <CardContent
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                  py: 2.5,
                }}
              >
                <Box sx={{ position: "relative" }}>
                  <Avatar
                    sx={{
                      width: 56,
                      height: 56,
                      bgcolor: MEDAL_COLORS[i],
                      fontSize: 24,
                      fontWeight: 700,
                    }}
                  >
                    {member.displayName?.charAt(0)}
                  </Avatar>
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: -4,
                      right: -4,
                      bgcolor: MEDAL_COLORS[i],
                      color: "#fff",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      border: "2px solid",
                      borderColor: "background.paper",
                    }}
                  >
                    {i + 1}
                  </Box>
                </Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                  {member.displayName}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }} color="primary">
                  {total(member).toLocaleString()}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                  }}
                >
                  則互動
                </Typography>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", justifyContent: "center" }}>
                  <StatChip
                    icon={<ForumIcon sx={{ fontSize: 14 }} color="action" />}
                    label="文字"
                    value={member.textCnt || 0}
                  />
                  <StatChip
                    icon={<ImageIcon sx={{ fontSize: 14 }} color="action" />}
                    label="圖片"
                    value={member.imageCnt || 0}
                  />
                  <StatChip
                    icon={<InsertEmoticonIcon sx={{ fontSize: 14 }} color="action" />}
                    label="貼圖"
                    value={member.stickerCnt || 0}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/* ---------- MyStats ---------- */
function MyStats({ rank, maxTotal }) {
  const userId = window.liff?.getContext?.()?.userId;
  const me = rank.find(m => m.userId === userId);
  if (!me) return null;

  const myTotal = total(me);
  const pct = maxTotal > 0 ? (myTotal / maxTotal) * 100 : 0;

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          我的數據
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: "primary.main" }}>
            {me.displayName?.charAt(0)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                {me.displayName}
              </Typography>
              <Chip label={`#${me.rank}`} size="small" color="primary" variant="outlined" />
            </Box>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{ height: 8, borderRadius: 4, mt: 0.5, mb: 1 }}
            />
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <StatChip
                icon={<ForumIcon sx={{ fontSize: 14 }} color="action" />}
                label="文字"
                value={me.textCnt || 0}
              />
              <StatChip
                icon={<ImageIcon sx={{ fontSize: 14 }} color="action" />}
                label="圖片"
                value={me.imageCnt || 0}
              />
              <StatChip
                icon={<InsertEmoticonIcon sx={{ fontSize: 14 }} color="action" />}
                label="貼圖"
                value={me.stickerCnt || 0}
              />
              <StatChip
                icon={<ReplayIcon sx={{ fontSize: 14 }} color="action" />}
                label="收回"
                value={me.unsendCnt || 0}
              />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

/* ---------- MemberRow ---------- */
function MemberRow({ member, maxTotal }) {
  const memberTotal = total(member);
  const pct = maxTotal > 0 ? (memberTotal / maxTotal) * 100 : 0;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
      <Typography
        variant="body2"
        sx={{
          width: 28,
          textAlign: "right",
          fontWeight: 600,
          color: "text.secondary",
          flexShrink: 0,
        }}
      >
        {member.rank}
      </Typography>
      <Avatar sx={{ width: 36, height: 36, fontSize: 14 }}>{member.displayName?.charAt(0)}</Avatar>
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
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              flexShrink: 0,
              ml: 1,
            }}
          >
            {memberTotal.toLocaleString()} 則
          </Typography>
        </Box>
        <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
        <Box sx={{ display: "flex", gap: 1.5, mt: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
            文字 {member.textCnt || 0}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
            圖片 {member.imageCnt || 0}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
            貼圖 {member.stickerCnt || 0}
          </Typography>
          {(member.unsendCnt || 0) > 0 && (
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              收回 {member.unsendCnt}
            </Typography>
          )}
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              ml: "auto",
            }}
          >
            {fmtDate(member.lastSpeakTS)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/* ---------- MemberList ---------- */
function MemberList({ rank, maxTotal }) {
  if (rank.length === 0) {
    return (
      <Paper sx={{ p: { xs: 4, sm: 5 }, textAlign: "center" }}>
        <Typography
          sx={{
            color: "text.secondary",
          }}
        >
          尚無成員數據
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ px: { xs: 2.5, sm: 3 }, py: { xs: 2, sm: 2.5 } }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, pb: 1.5 }}>
        全員活躍度排行
      </Typography>
      {rank.map((member, i) => (
        <Box key={member.userId}>
          {i > 0 && <Divider />}
          <MemberRow member={member} maxTotal={maxTotal} />
        </Box>
      ))}
    </Paper>
  );
}

/* ---------- Loading skeleton ---------- */
function RecordSkeleton() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Skeleton variant="rounded" height={120} animation="wave" />
      <Grid container spacing={2}>
        {[1, 2, 3].map(i => (
          <Grid size={{ xs: 12, sm: 4 }} key={i}>
            <Skeleton variant="rounded" height={200} animation="wave" />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={60} animation="wave" />
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} variant="rounded" height={48} animation="wave" />
      ))}
    </Box>
  );
}

/* ---------- GroupRecord (main export) ---------- */
export default function GroupRecord() {
  const { groupId } = useParams();
  const isLoggedIn = window.liff?.isLoggedIn?.() ?? false;

  const [{ data: rankData, loading: rankLoading }, fetchRank] = useAxios(
    { url: `/api/groups/${groupId}/speak-rank` },
    { manual: true }
  );
  const [{ data: groupData, loading: groupLoading }, fetchGroup] = useAxios(
    { url: `/api/guilds/${groupId}` },
    { manual: true }
  );

  useEffect(() => {
    document.title = "群組數據";
  }, []);

  useEffect(() => {
    fetchRank();
    fetchGroup();
  }, [groupId, fetchRank, fetchGroup]);

  const rank = useMemo(() => {
    return (rankData || []).map((data, index) => ({
      ...data,
      rank: index + 1,
    }));
  }, [rankData]);

  const maxTotal = useMemo(() => {
    if (rank.length === 0) return 0;
    return total(rank[0]);
  }, [rank]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (rankLoading || groupLoading || !rankData || !groupData) {
    return <RecordSkeleton />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <GroupBanner group={groupData} rank={rank} />
      <TopContributors rank={rank} />
      <MyStats rank={rank} maxTotal={maxTotal} />
      <MemberList rank={rank} maxTotal={maxTotal} />
    </Box>
  );
}
