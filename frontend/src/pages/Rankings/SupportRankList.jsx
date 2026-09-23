import { useId, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  List,
  ListItem,
  Skeleton,
  Snackbar,
  Switch,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha, keyframes } from "@mui/material/styles";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import { useSupportRanking } from "./hooks";
import { MEDAL_COLORS_BY_MODE, DEFAULT_AVATAR_COLOR } from "./medalColors";

// Mockup: docs/mockups/support-leaderboard.html
const rise = keyframes`from { opacity: 0; transform: translateY(6px); }`;

function ThanksHeader() {
  const theme = useTheme();
  const accent = theme.palette.secondary.main;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.75,
        py: 1.5,
        borderRadius: 1,
        background: `linear-gradient(135deg, ${alpha(accent, 0.1)} 0%, transparent 100%)`,
        border: `1px solid ${alpha(accent, 0.25)}`,
      }}
    >
      <FavoriteRoundedIcon sx={{ fontSize: 28, color: accent }} />
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
          謝謝每一位支持布丁的人
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          依累積支持月數排列
        </Typography>
      </Box>
    </Box>
  );
}

function OptOutSwitch({ hidden, saving, onChange }) {
  const id = useId();
  return (
    <Box
      component="label"
      htmlFor={id}
      sx={theme => ({
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        border: 1,
        borderColor: hidden ? alpha(theme.palette.primary.main, 0.3) : "divider",
        bgcolor: hidden ? alpha(theme.palette.primary.main, 0.08) : "transparent",
        cursor: saving ? "default" : "pointer",
      })}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          不要讓我上榜
        </Typography>
        <Typography
          variant="caption"
          component="div"
          sx={{ color: "text.secondary", lineHeight: 1.5 }}
        >
          {hidden
            ? "你目前沒有顯示在榜上。關掉就會重新出現。"
            : "開啟後，其他人在這裡看不到你的名字和月數。"}
        </Typography>
      </Box>
      <Switch
        id={id}
        checked={hidden}
        disabled={saving}
        onChange={e => onChange(e.target.checked)}
        color="primary"
      />
    </Box>
  );
}

function RankRow({ item, index, isMe, medalColor, defaultAvatarColor, monthsColor }) {
  const { rank, display_name: name, picture_url: picture, months } = item;
  return (
    <ListItem
      disableGutters
      sx={theme => ({
        minHeight: 56,
        gap: 1.25,
        pl: 1,
        pr: 1.5,
        py: 0.75,
        borderRadius: 1,
        ...(medalColor && {
          background: `linear-gradient(90deg, ${alpha(medalColor, 0.14)}, transparent 70%)`,
        }),
        ...(isMe && {
          background: alpha(theme.palette.primary.main, 0.08),
          boxShadow: `inset 3px 0 0 ${theme.palette.primary.main}`,
        }),
        "@media (prefers-reduced-motion: no-preference)": {
          animation: `${rise} 0.35s ease-out both`,
          animationDelay: `${Math.min(index, 12) * 35}ms`,
        },
      })}
    >
      <Box sx={{ width: 26, flexShrink: 0, display: "flex", justifyContent: "center" }}>
        {medalColor ? (
          <Avatar
            sx={{
              width: 24,
              height: 24,
              bgcolor: medalColor,
              color: "#fff",
              fontSize: "0.75rem",
              fontWeight: 800,
              textShadow: "0 1px 1px rgba(0,0,0,0.25)",
            }}
          >
            {rank}
          </Avatar>
        ) : (
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
          >
            {rank}
          </Typography>
        )}
      </Box>
      <Avatar
        src={picture || undefined}
        alt=""
        sx={theme => ({
          width: 38,
          height: 38,
          bgcolor: defaultAvatarColor,
          fontWeight: 700,
          ...(medalColor && {
            boxShadow: `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${medalColor}`,
          }),
        })}
      >
        {[...(name || "?")][0]}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {name}
        </Typography>
        {isMe && (
          <Box
            component="span"
            sx={{
              flexShrink: 0,
              fontSize: "0.68rem",
              fontWeight: 700,
              lineHeight: 1,
              px: 0.875,
              py: 0.375,
              borderRadius: 999,
              color: "primary.main",
              border: 1,
              borderColor: "primary.main",
            }}
          >
            你
          </Box>
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{ flexShrink: 0, color: "text.secondary", whiteSpace: "nowrap" }}
      >
        <Box
          component="b"
          sx={{
            fontSize: "1.05rem",
            fontWeight: 800,
            color: monthsColor,
            mr: 0.25,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {months}
        </Box>
        個月
      </Typography>
    </ListItem>
  );
}

function EmptyState() {
  const theme = useTheme();
  const accent = theme.palette.secondary.main;
  return (
    <Box
      sx={{
        minHeight: 300,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 1,
        p: 3,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          bgcolor: alpha(accent, 0.1),
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 1,
        }}
      >
        <VolunteerActivismIcon sx={{ fontSize: 34 }} />
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 700 }}>
        目前還沒有人上榜
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        第一位支持者會出現在這裡。
      </Typography>
    </Box>
  );
}

const SAVE_ERROR = {
  403: "你目前沒有支持紀錄，無法變更這個設定。",
};

export default function SupportRankList() {
  const theme = useTheme();
  const { items, total, me, loading, error, saving, setHidden } = useSupportRanking();
  const [snack, setSnack] = useState(null);

  const mode = theme.palette.mode === "dark" ? "dark" : "light";
  const medalColors = MEDAL_COLORS_BY_MODE[mode];
  const defaultAvatarColor = DEFAULT_AVATAR_COLOR[mode];
  // secondary.main 在白底對比不足，淺色模式改用深一階琥珀（同 mockup）。
  const monthsColor = mode === "dark" ? theme.palette.secondary.main : "#B45309";
  const myRank = me.has_support && !me.hidden ? me.rank : null;

  const handleToggle = async hidden => {
    const res = await setHidden(hidden);
    if (!res.ok) setSnack(SAVE_ERROR[res.status] ?? "儲存失敗，請稍後再試。");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <ThanksHeader />

      {loading ? (
        <>
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </>
      ) : (
        <>
          {me.has_support && (
            <OptOutSwitch hidden={me.hidden} saving={saving} onChange={handleToggle} />
          )}

          {error ? (
            <Alert severity="error" variant="outlined">
              支持榜載入失敗，請稍後再試。
            </Alert>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  px: 1,
                  mt: 0.5,
                }}
              >
                <Typography variant="subtitle2" sx={{ color: "text.secondary", fontWeight: 600 }}>
                  支持者名單
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  共 {total} 人
                </Typography>
              </Box>
              <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                {items.map((item, i) => (
                  <RankRow
                    key={item.rank}
                    item={item}
                    index={i}
                    isMe={myRank !== null && item.rank === myRank}
                    medalColor={item.rank <= 3 ? medalColors[item.rank - 1] : null}
                    defaultAvatarColor={defaultAvatarColor}
                    monthsColor={monthsColor}
                  />
                ))}
              </List>
              {!me.has_support && (
                <Typography
                  variant="caption"
                  component="p"
                  sx={{ textAlign: "center", color: "text.secondary", m: 0, px: 1, pb: 1 }}
                >
                  想一起支持布丁，可以私訊站務聊聊。
                </Typography>
              )}
            </>
          )}
        </>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {snack ? (
          <Alert onClose={() => setSnack(null)} severity="error" variant="filled">
            {snack}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
