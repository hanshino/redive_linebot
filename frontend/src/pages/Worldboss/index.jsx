import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import BoltIcon from "@mui/icons-material/Bolt";
import CampaignIcon from "@mui/icons-material/Campaign";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import HandshakeIcon from "@mui/icons-material/Handshake";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import RefreshIcon from "@mui/icons-material/Refresh";
import ShieldIcon from "@mui/icons-material/Shield";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import api from "../../services/api";
import useLiff from "../../context/useLiff";
import useHintBar from "../../hooks/useHintBar";
import HintSnackBar from "../../components/HintSnackBar";

// Group ids only. The server verifies an announcement target against
// CHAT_USER_LAST_GROUP, which app/bin/EventDequeue.js writes only for
// `source.type === "group"` — so a room id could never match and would be dropped
// server-side anyway. Sending one buys nothing, so it is omitted here.
const GROUP_ID = /^C[0-9a-f]{32}$/;
// Matches worldboss.attack_cooldown_seconds. Only used to re-enable the buttons after
// a 429; the server stays the authority and we never auto-retry.
const COOLDOWN_MS = 5000;

/**
 * The LIFF context is the only source for which chat launched this page. Only a real
 * group is forwarded — never rendered, never stored, and the server re-verifies that
 * the user actually spoke there before it announces anything.
 *
 * Rooms are deliberately excluded: world boss clear announcements do not support them,
 * so an attack from a room still succeeds, it just never announces.
 */
function contextGroupId(liffContext) {
  if (liffContext?.type !== "group") return null;
  const id = liffContext.groupId;
  return typeof id === "string" && GROUP_ID.test(id) ? id : null;
}

function attackErrorLabel(error) {
  const status = error.response?.status;
  const code = error.response?.data?.error;
  if (status === 409)
    return { severity: "warning", message: "戰況已更新，已為你重新載入最新狀態。" };
  if (status === 422) {
    return {
      severity: "warning",
      message:
        code === "DAILY_LIMIT_EXCEEDED"
          ? "今日行動額度已用盡，明天再來討伐。"
          : "目前無法攻擊，請稍後再試。",
    };
  }
  if (status === 429) return { severity: "info", message: "攻擊冷卻中，請稍候幾秒再出手。" };
  if (status === 400) return { severity: "error", message: "攻擊要求無效，請重新整理後再試。" };
  return { severity: "error", message: "攻擊失敗，請稍後再試。" };
}

/**
 * The two relay effects a hit can leave on a boss. Every label, colour and icon for them
 * lives here so a card, a chip and the attack result can never drift apart.
 */
const EFFECT_META = {
  banner: {
    label: "鼓舞",
    caption: "接的人和留的人都得分，不扣王的血",
    Icon: CampaignIcon,
    tone: theme => theme.palette.secondary.main,
  },
  seal: {
    label: "魔力刻印",
    caption: "被引爆時轉成傷害，分數歸留下的人",
    Icon: AutoFixHighIcon,
    tone: () => "#8B5CF6",
  },
};

const UNKNOWN_EFFECT = {
  label: "未知效果",
  caption: "",
  Icon: AutoFixHighIcon,
  tone: theme => theme.palette.text.secondary,
};

function effectMeta(type) {
  return EFFECT_META[type] ?? UNKNOWN_EFFECT;
}

/** The three books the score is kept in. Order is fixed: own damage first, then the two co-op rows. */
const SCORE_KINDS = [
  {
    key: "direct",
    label: "自身",
    caption: "自己打出的傷害",
    Icon: BoltIcon,
    tone: theme => theme.palette.primary.main,
  },
  {
    key: "assist",
    label: "協助",
    caption: "我留下的效果被別人接走",
    Icon: HandshakeIcon,
    tone: theme => theme.palette.secondary.main,
  },
  {
    key: "relay",
    label: "接力",
    caption: "我接走別人留下的鼓舞",
    Icon: ArrowForwardIcon,
    tone: theme => theme.palette.success.main,
  },
];

const DAMAGE_FIELDS = [
  { key: "raw", label: "自身傷害" },
  { key: "effect", label: "引爆刻印" },
  { key: "effective", label: "實際扣血" },
];

/**
 * Folds an attack response back into the board without a full refetch. The server's
 * own `status` is authoritative; `me.current` is patched from the same response so the
 * personal numbers can't disagree with the board they were returned with.
 *
 * `scoreGained` carries the whole ledger the hit wrote, and `assist` in it is credited to
 * the player whose effect was consumed — never to the attacker. Only `direct` and `relay`
 * are folded into the caller's own breakdown; a new `assist` of mine can only arrive when
 * somebody else takes my effect, which the next `/me` read picks up.
 */
function mergeAfterAttack(previous, payload) {
  const { attack, status, latestReward } = payload;
  const nextStatus = status ?? previous.status;
  const seasonId =
    canonicalSeasonId(nextStatus?.season?.id) ?? canonicalSeasonId(previous.me?.current?.seasonId);
  const current = previous.me?.current;

  return {
    ...previous,
    ...(status ? { status } : {}),
    me: {
      ...previous.me,
      current:
        seasonId === null
          ? (current ?? null)
          : {
              ...current,
              seasonId,
              totalScore: attack.seasonTotalScore,
              score: {
                direct: addDecimal(current?.score?.direct, attack.scoreGained?.direct),
                assist: current?.score?.assist ?? null,
                relay: addDecimal(current?.score?.relay, attack.scoreGained?.relay),
              },
              damage: {
                raw: addDecimal(current?.damage?.raw, attack.rawDamage),
                effect: addDecimal(current?.damage?.effect, attack.effectDamage),
                effective: attack.seasonTotalDamage,
                overkill: addDecimal(current?.damage?.overkill, attack.overkillDamage),
              },
              daily: attack.daily,
              effects: withCreatedEffect(current?.effects, attack),
            },
      latestReward: latestReward ?? previous.me?.latestReward ?? null,
    },
  };
}

/**
 * Puts the effect this hit just left at the top of "what I left behind", so the history
 * agrees with the result card that just announced it. Shaped exactly like a `/me` row.
 */
function withCreatedEffect(effects, attack) {
  const list = Array.isArray(effects) ? effects : [];
  const created = attack.createdEffect;
  if (!created) return list;
  return [
    {
      effectId: created.id,
      type: created.type,
      value: created.value,
      roundId: attack.roundId,
      createdAt: new Date().toISOString(),
      consumedAt: null,
      consumedBy: null,
    },
    ...list.filter(effect => String(effect.effectId) !== String(created.id)),
  ];
}

function decimalToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

/**
 * BIGINT arithmetic for the optimistic merge. Every score/damage field arrives as a
 * decimal string that can exceed Number.MAX_SAFE_INTEGER, so the sum stays in BigInt and
 * comes back out as a string. An unparsable side gives up and returns null, which renders
 * as "—" instead of a wrong number until the next fetch corrects it.
 */
function addDecimal(left, right) {
  const a = decimalToBigInt(left ?? "0");
  const b = decimalToBigInt(right ?? "0");
  return a === null || b === null ? null : (a + b).toString();
}

/** True only for a decimal string/number that is strictly greater than zero. */
function isPositive(value) {
  const parsed = decimalToBigInt(value);
  return parsed !== null && parsed > 0n;
}

function canonicalSeasonId(value) {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function leaderboardSnapshot(value) {
  const seasonId = canonicalSeasonId(value?.seasonId);
  return {
    seasonId,
    rows: seasonId !== null && Array.isArray(value?.rows) ? value.rows : [],
  };
}

function leaderboardView(status, leaderboard, errors) {
  const statusSeasonId = canonicalSeasonId(status?.season?.id);
  const matchesStatus = Boolean(
    leaderboard !== undefined &&
    ((status === null && leaderboard.seasonId === null) ||
      (statusSeasonId !== null && leaderboard.seasonId === statusSeasonId))
  );
  return {
    rows: matchesStatus ? leaderboard.rows : undefined,
    unavailable: Boolean(errors.status || errors.leaderboard || !matchesStatus),
  };
}

function formatInteger(value) {
  if (typeof value === "bigint") return value.toLocaleString("en-US");
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const negative = value.startsWith("-");
    const digits = value.slice(negative ? 1 : 0).replace(/^0+(?=\d)/, "");
    return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US").format(value);
  }
  return value == null ? "—" : String(value);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

function safeHpPercent(round) {
  const maxHp = decimalToBigInt(round?.max_hp);
  const currentHp = decimalToBigInt(round?.current_hp);
  if (maxHp === null || currentHp === null || maxHp <= 0n) return null;

  const boundedHp = currentHp < 0n ? 0n : currentHp > maxHp ? maxHp : currentHp;
  return Number((boundedHp * 10000n) / maxHp) / 100;
}

function endpointErrorLabel(error) {
  return error.response?.data?.error || error.response?.data?.message || "連線失敗";
}

function SummaryStat({ label, value, tone = "text.primary" }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography
        variant="body1"
        color={tone}
        sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function LoadingBoard() {
  return (
    <Container maxWidth="lg" sx={{ py: 1 }} role="status" aria-live="polite">
      <Typography
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        正在載入世界王資料，請稍候。
      </Typography>
      <Stack spacing={2} aria-hidden="true">
        <Skeleton variant="text" width={180} height={44} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Skeleton variant="rounded" height={360} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Skeleton variant="rounded" height={220} />
          </Grid>
        </Grid>
        <Skeleton variant="rounded" height={320} />
      </Stack>
    </Container>
  );
}

/**
 * The season score, broken into where it came from. The hero number is the score, not the
 * damage — the leaderboard ranks on score, and the whole point of the split is that damage
 * alone no longer explains a rank.
 */
function ScoreBreakdown({ score }) {
  return (
    <Grid container spacing={1}>
      {SCORE_KINDS.map(({ key, label, caption, Icon, tone }) => {
        const value = score?.[key];
        const earned = isPositive(value);
        return (
          <Grid key={key} size={{ xs: 4 }}>
            <Box
              sx={theme => ({
                height: "100%",
                px: 1.25,
                py: 1.25,
                borderRadius: 2,
                border: "1px solid",
                borderColor: earned ? alpha(tone(theme), 0.45) : "divider",
                bgcolor: earned ? alpha(tone(theme), 0.1) : "transparent",
                transition: "background-color .25s ease-out, border-color .25s ease-out",
              })}
            >
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.25 }}>
                <Icon
                  sx={theme => ({
                    fontSize: 16,
                    color: earned ? tone(theme) : "text.disabled",
                  })}
                />
                <Typography
                  variant="caption"
                  sx={theme => ({
                    fontWeight: 700,
                    lineHeight: 1.2,
                    color: earned ? tone(theme) : "text.secondary",
                  })}
                >
                  {label}
                </Typography>
              </Stack>
              <Typography
                sx={theme => ({
                  fontWeight: 800,
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                  overflowWrap: "anywhere",
                  fontSize: { xs: "1rem", sm: "1.125rem" },
                  color: earned ? tone(theme) : "text.disabled",
                })}
              >
                {formatInteger(value)}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.25, lineHeight: 1.3 }}
              >
                {caption}
              </Typography>
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}

/**
 * Damage is now a supporting statistic. Overkill gets its own line because the rule change
 * lives there: it used to be thrown away, and it is now scored in full.
 */
function DamageBreakdown({ damage }) {
  const overkill = damage?.overkill;
  const hasOverkill = isPositive(overkill);

  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: "block", lineHeight: 1.6 }}
      >
        傷害統計
      </Typography>
      <Grid container spacing={1} sx={{ mt: 0.25 }}>
        {DAMAGE_FIELDS.map(({ key, label }) => (
          <Grid key={key} size={{ xs: 4 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              {label}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
            >
              {formatInteger(damage?.[key])}
            </Typography>
          </Grid>
        ))}
      </Grid>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={theme => ({
          mt: 1,
          px: 1.25,
          py: 0.75,
          borderRadius: 2,
          border: "1px dashed",
          borderColor: hasOverkill ? alpha(theme.palette.success.main, 0.5) : "divider",
          bgcolor: hasOverkill ? alpha(theme.palette.success.main, 0.08) : "transparent",
        })}
      >
        <CheckCircleIcon
          sx={{ fontSize: 18, color: hasOverkill ? "success.main" : "text.disabled" }}
        />
        <Box minWidth={0} flex={1}>
          <Typography variant="caption" color="text.secondary" display="block">
            溢傷（超過王剩餘 HP 的部分）
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            不扣王的血，但全額計入分數
          </Typography>
        </Box>
        <Typography
          sx={{
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            overflowWrap: "anywhere",
            color: hasOverkill ? "success.main" : "text.disabled",
          }}
        >
          {formatInteger(overkill)}
        </Typography>
      </Stack>
    </Box>
  );
}

function PersonalStats({ current, unavailable = false }) {
  const daily = current?.daily;

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="flex-end"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
      >
        <Box minWidth={0}>
          <Typography variant="caption" color="text.secondary" display="block">
            賽季總分（排行榜依據）
          </Typography>
          <Typography
            component="p"
            sx={{
              fontWeight: 900,
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
              overflowWrap: "anywhere",
              fontSize: { xs: "2rem", sm: "2.5rem" },
              background: theme =>
                `linear-gradient(120deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {formatInteger(current?.totalScore)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
          <Typography variant="caption" color="text.secondary" display="block">
            今日剩餘 / 額度
          </Typography>
          <Typography
            sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
            color="primary.main"
          >
            {daily ? `${formatInteger(daily.remaining)} / ${formatInteger(daily.limit)}` : "—"}
          </Typography>
        </Box>
      </Stack>

      <ScoreBreakdown score={current?.score} />
      <DamageBreakdown damage={current?.damage} />

      {unavailable && (
        <Typography variant="caption" color="warning.main">
          個人資料與目前賽季不同步，請重新整理後再試。
        </Typography>
      )}
    </Stack>
  );
}

/**
 * "What I left behind, and who picked it up." A player can never consume their own effect,
 * so this list is the only place the interaction with other players is visible — an unclaimed
 * row is an open invitation, a claimed one is a name.
 */
function EffectHistory({ effects }) {
  const rows = Array.isArray(effects) ? effects : [];
  if (rows.length === 0) {
    return (
      <Box
        sx={{
          py: 3,
          px: 2,
          textAlign: "center",
          borderRadius: 2,
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          這個賽季還沒有留下任何效果。
        </Typography>
        <Typography variant="caption" color="text.secondary">
          冒險者攻擊後會留下鼓舞，法師會留下魔力刻印，等其他玩家來接。
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1}>
      {rows.map(effect => {
        const { label, Icon, tone } = effectMeta(effect.type);
        const claimed = Boolean(effect.consumedAt);
        const taker = effect.consumedBy?.displayName || effect.consumedBy?.userId || "某位玩家";

        return (
          <Box
            key={effect.effectId}
            sx={theme => ({
              position: "relative",
              px: 1.5,
              py: 1.25,
              borderRadius: 2,
              overflow: "hidden",
              border: "1px solid",
              borderColor: claimed ? alpha(tone(theme), 0.4) : "divider",
              bgcolor: claimed ? alpha(tone(theme), 0.08) : "transparent",
              borderStyle: claimed ? "solid" : "dashed",
              "&::before": {
                content: '""',
                position: "absolute",
                insetBlock: 0,
                insetInlineStart: 0,
                width: 3,
                bgcolor: claimed ? tone(theme) : alpha(theme.palette.text.disabled, 0.4),
              },
            })}
          >
            <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ pl: 0.75 }}>
              <Avatar
                variant="rounded"
                sx={theme => ({
                  width: 32,
                  height: 32,
                  bgcolor: claimed ? alpha(tone(theme), 0.18) : "action.hover",
                  color: claimed ? tone(theme) : "text.disabled",
                })}
              >
                <Icon sx={{ fontSize: 18 }} />
              </Avatar>
              <Box minWidth={0} flex={1}>
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="baseline"
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Typography
                    variant="body2"
                    sx={theme => ({
                      fontWeight: 800,
                      color: claimed ? tone(theme) : "text.primary",
                    })}
                  >
                    {label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                    color="text.secondary"
                  >
                    {formatInteger(effect.value)}
                  </Typography>
                </Stack>
                {claimed ? (
                  <Typography variant="caption" color="text.secondary" display="block">
                    被 <b>{taker}</b> 接走 · {formatDate(effect.consumedAt)}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" display="block">
                    還掛在王身上 · 留於 {formatDate(effect.createdAt)}
                  </Typography>
                )}
              </Box>
              <Chip
                size="small"
                icon={
                  claimed ? (
                    <HandshakeIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <HourglassEmptyIcon sx={{ fontSize: 14 }} />
                  )
                }
                label={claimed ? "已接走" : "等人接"}
                variant={claimed ? "filled" : "outlined"}
                sx={theme => ({
                  flexShrink: 0,
                  fontWeight: 700,
                  height: 24,
                  ...(claimed
                    ? { bgcolor: alpha(tone(theme), 0.16), color: tone(theme) }
                    : { color: "text.secondary" }),
                })}
              />
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function EffectHistoryCard({ effects }) {
  const rows = Array.isArray(effects) ? effects : [];
  const claimed = rows.filter(effect => effect.consumedAt).length;

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={1.75}>
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              我留下的效果
            </Typography>
            <Typography variant="body2" color="text.secondary">
              自己不能接自己的效果，要等別人來接。
              {rows.length > 0 && ` 已被接走 ${claimed} / ${rows.length}`}
            </Typography>
          </Box>
          <EffectHistory effects={rows} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function PersonalProgressCard({ current, unavailable }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
            個人討伐進度
          </Typography>
          <PersonalStats current={current} unavailable={unavailable} />
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Effects sitting on this boss right now, waiting for somebody other than the person who
 * left them. Cleared bosses always report zeros server-side, and are skipped anyway.
 */
function PendingEffectsRow({ pending }) {
  const waiting = ["banner", "seal"].filter(type => isPositive(pending?.[type]));
  if (waiting.length === 0) return null;

  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {waiting.map(type => {
        const { label, Icon, tone } = effectMeta(type);
        return (
          <Chip
            key={type}
            size="small"
            icon={<Icon sx={{ fontSize: 14 }} />}
            label={`${label} ×${formatInteger(pending[type])}`}
            aria-label={`待接力 ${label} ${formatInteger(pending[type])} 個`}
            sx={theme => ({
              height: 22,
              fontWeight: 700,
              fontSize: "0.7rem",
              color: tone(theme),
              bgcolor: alpha(tone(theme), 0.12),
              border: "1px solid",
              borderColor: alpha(tone(theme), 0.35),
              "& .MuiChip-icon": { color: "inherit", ml: 0.5 },
              "& .MuiChip-label": { px: 0.75 },
            })}
          />
        );
      })}
    </Stack>
  );
}

/**
 * One encounter in the current cycle. Each boss carries its own HP, so a cleared boss
 * has to read as finished at a glance while its neighbours are still live.
 */
function BossRoundCard({ round, onAttack, busy, disabled }) {
  const hpPercent = safeHpPercent(round);
  const cleared = Boolean(round.cleared_at);
  const pending = cleared ? null : round.pending_effects;
  const hasPending = Boolean(pending && (isPositive(pending.banner) || isPositive(pending.seal)));

  return (
    <Card
      variant="outlined"
      sx={theme => ({
        height: "100%",
        borderColor: cleared
          ? "success.light"
          : hasPending
            ? alpha(theme.palette.secondary.main, 0.55)
            : "divider",
        bgcolor: cleared ? "action.hover" : "background.paper",
        ...(hasPending && { boxShadow: `0 0 0 1px ${alpha(theme.palette.secondary.main, 0.2)}` }),
      })}
    >
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Avatar
              variant="rounded"
              src={round.image || undefined}
              alt={round.name || "世界王"}
              sx={{
                width: 44,
                height: 44,
                bgcolor: cleared ? "success.main" : "secondary.main",
                filter: cleared ? "grayscale(0.6)" : "none",
              }}
            >
              <ShieldIcon />
            </Avatar>
            <Box minWidth={0} flex={1}>
              <Typography variant="caption" color="text.secondary" display="block">
                {formatInteger(round.position)} 號位
              </Typography>
              <Typography sx={{ fontWeight: 800, lineHeight: 1.25 }} noWrap>
                {round.name || "未知世界王"}
              </Typography>
            </Box>
            {cleared && <TaskAltIcon color="success" fontSize="small" aria-label="已討伐" />}
          </Stack>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={0.5}>
              <Typography variant="caption" color="text.secondary">
                {cleared ? "已討伐" : "剩餘 HP"}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", textAlign: "right" }}
              >
                {formatInteger(round.current_hp)} / {formatInteger(round.max_hp)}
              </Typography>
            </Stack>
            {hpPercent === null ? (
              <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.5 }}>
                無法計算 HP 比例
              </Typography>
            ) : (
              <>
                <LinearProgress
                  variant="determinate"
                  value={cleared ? 0 : hpPercent}
                  color={cleared ? "success" : "primary"}
                  aria-label={`${round.name || "世界王"} HP ${cleared ? 0 : hpPercent}%`}
                  sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  textAlign="right"
                  sx={{ mt: 0.25, fontVariantNumeric: "tabular-nums" }}
                >
                  {cleared ? 0 : hpPercent}%
                </Typography>
              </>
            )}
          </Box>

          {cleared ? (
            <Typography
              variant="caption"
              color="success.main"
              sx={{ fontWeight: 700, textAlign: "center", py: 0.5 }}
            >
              已討伐
            </Typography>
          ) : (
            <Stack spacing={0.75}>
              {hasPending && (
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mb: 0.5 }}
                  >
                    待接力
                  </Typography>
                  <PendingEffectsRow pending={pending} />
                </Box>
              )}
              <Button
                variant="contained"
                fullWidth
                disabled={disabled}
                onClick={() => onAttack(round, "standard")}
                startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}
                sx={{ fontWeight: 700, minHeight: 40 }}
              >
                普通攻擊
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                fullWidth
                disabled={disabled}
                onClick={() => onAttack(round, "skill")}
                sx={{ fontWeight: 700, minHeight: 40 }}
              >
                技能攻擊
              </Button>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function BattleCard({ status, current, currentUnavailable, onAttack, attackingRoundId, locked }) {
  const { season, cycleNo, rounds, ended } = status;
  const clearedCount = rounds.filter(round => round.cleared_at).length;

  return (
    <Card variant="outlined" sx={{ height: "100%", overflow: "hidden" }}>
      <Box
        sx={{
          bgcolor: ended ? "warning.main" : "primary.main",
          color: ended ? "warning.contrastText" : "primary.contrastText",
          px: { xs: 2, sm: 2.5 },
          py: 1.75,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box minWidth={0}>
            <Typography variant="overline" sx={{ lineHeight: 1, opacity: 0.82 }}>
              世界王討伐
            </Typography>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              {season.name || "未命名賽季"}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25, opacity: 0.9, fontWeight: 700 }}>
              第 {formatInteger(cycleNo)} 周回 · 已討伐 {clearedCount} / {rounds.length}
            </Typography>
          </Box>
          <Chip
            label={ended ? "結算處理中" : "進行中"}
            size="small"
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "inherit",
              fontWeight: 700,
              flexShrink: 0,
            }}
          />
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2.25}>
          <Grid container spacing={1.5} columns={{ xs: 12, lg: 10 }}>
            {rounds.map(round => (
              <Grid key={round.id} size={{ xs: 6, sm: 4, lg: 2 }}>
                <BossRoundCard
                  round={round}
                  onAttack={onAttack}
                  busy={attackingRoundId === round.id}
                  disabled={locked || ended}
                />
              </Grid>
            ))}
          </Grid>

          <Divider />

          <PersonalStats current={current} unavailable={currentUnavailable} />

          <Typography variant="caption" color="text.secondary">
            活動結束：{formatDate(season.end_time)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AttackStat({ label, value, tone }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
          ...(tone ? { color: tone } : {}),
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Attacker-only result of the most recent hit. Sits above the board so the numbers
 * land where the user was already looking after tapping.
 *
 * `scoreGained.assist` is deliberately labelled as going to somebody else: the ledger this
 * hit wrote credits it to the owner of the consumed effect, never to the attacker.
 */
function AttackResultCard({ attack, onDismiss }) {
  const cleared = Boolean(attack.cleared);
  const full = Boolean(attack.cycleAdvanced);
  const consumed = attack.consumedEffect;
  const created = attack.createdEffect;
  const consumedMeta = consumed ? effectMeta(consumed.type) : null;
  const createdMeta = created ? effectMeta(created.type) : null;
  const overkill = attack.overkillDamage;

  return (
    <Alert
      severity={full || cleared ? "success" : "info"}
      variant="outlined"
      onClose={onDismiss}
      aria-live="polite"
      sx={{ "& .MuiAlert-message": { width: "100%", minWidth: 0 } }}
    >
      <Typography sx={{ fontWeight: 800 }}>
        {full
          ? `本周回全滅！第 ${formatInteger(attack.cycleNo)} 周回開始`
          : cleared
            ? `已擊破 ${attack.boss?.name || "世界王"}`
            : "攻擊成功"}
      </Typography>

      <Stack spacing={1.25} sx={{ mt: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ color: "text.primary" }}
        >
          <AttackStat label="自身傷害" value={formatInteger(attack.rawDamage)} />
          {isPositive(attack.effectDamage) && (
            <>
              <Typography color="text.disabled">+</Typography>
              <AttackStat label="引爆刻印" value={formatInteger(attack.effectDamage)} />
            </>
          )}
          <ArrowForwardIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <AttackStat label="實際扣血" value={formatInteger(attack.effectiveDamage)} />
          {isPositive(overkill) && (
            <Chip
              size="small"
              label={`溢傷 ${formatInteger(overkill)} 全額計分`}
              color="success"
              variant="outlined"
              sx={{ height: 22, fontWeight: 700, fontSize: "0.7rem" }}
            />
          )}
        </Stack>

        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <AttackStat
            label="這刀的分數"
            value={formatInteger(attack.scoreGained?.direct)}
            tone="primary.main"
          />
          {isPositive(attack.scoreGained?.relay) && (
            <AttackStat
              label="接力加分"
              value={formatInteger(attack.scoreGained?.relay)}
              tone="success.main"
            />
          )}
          {isPositive(attack.scoreGained?.assist) && (
            <AttackStat
              label={`回饋給${consumed?.sourceDisplayName || "留效果的人"}`}
              value={formatInteger(attack.scoreGained?.assist)}
              tone="secondary.main"
            />
          )}
        </Stack>

        {(consumed || created) && (
          <Stack spacing={0.75}>
            {consumed && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={theme => ({
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  bgcolor: alpha(consumedMeta.tone(theme), 0.12),
                })}
              >
                <consumedMeta.Icon
                  sx={theme => ({ fontSize: 18, color: consumedMeta.tone(theme) })}
                />
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  你接走了 <b>{consumed.sourceDisplayName || "某位玩家"}</b> 的{consumedMeta.label}
                  （{formatInteger(consumed.value)}）
                </Typography>
              </Stack>
            )}
            {created && (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={theme => ({
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 2,
                  border: "1px dashed",
                  borderColor: alpha(createdMeta.tone(theme), 0.5),
                })}
              >
                <createdMeta.Icon
                  sx={theme => ({ fontSize: 18, color: createdMeta.tone(theme) })}
                />
                <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                  你在這隻王身上留下了{createdMeta.label}（{formatInteger(created.value)}），等其他
                  玩家來接
                </Typography>
              </Stack>
            )}
          </Stack>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
          消耗 {formatInteger(attack.cost)} · 今日剩餘 {formatInteger(attack.daily?.remaining)} ·
          賽季總分 {formatInteger(attack.seasonTotalScore)}
          {attack.levelResult?.levelUp
            ? ` · 職業等級提升至 Lv.${formatInteger(attack.levelResult.newLevel)}`
            : ""}
        </Typography>
      </Stack>

      {attack.announcementQueued && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          擊破公告會在群組的下一則訊息時送出。
        </Typography>
      )}
    </Alert>
  );
}

function NoActiveSeason() {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderStyle: "dashed" }}>
      <CardContent sx={{ py: { xs: 5, sm: 7 }, textAlign: "center" }}>
        <ShieldIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          目前沒有進行中的世界王
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          下一季開放後，這裡會顯示討伐戰況與個人額度。
        </Typography>
      </CardContent>
    </Card>
  );
}

function UnavailableStatus() {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderStyle: "dashed" }}>
      <CardContent sx={{ py: { xs: 5, sm: 7 }, textAlign: "center" }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          戰況暫時無法更新
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          請重新整理以取得目前世界王狀態。
        </Typography>
      </CardContent>
    </Card>
  );
}

function LatestRewardCard({ reward }) {
  const titleName = reward.titleName || "無稱號";

  return (
    <Card variant="outlined" sx={{ height: "100%", borderColor: "warning.light" }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Avatar sx={{ bgcolor: "warning.main", color: "warning.contrastText" }}>
              <EmojiEventsIcon />
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="overline" color="warning.dark" sx={{ lineHeight: 1 }}>
                最新結算紀錄
              </Typography>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }} noWrap>
                {reward.seasonName || "世界王賽季"}
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              <SummaryStat label="排名" value={`第 ${formatInteger(reward.ranking)} 名`} />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <SummaryStat
                label="女神石"
                value={formatInteger(reward.stoneAmount ?? 0)}
                tone="warning.dark"
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <SummaryStat label="稱號" value={titleName} />
            </Grid>
          </Grid>

          <Divider />

          <Stack spacing={1}>
            <SummaryStat
              label="賽季總分"
              value={reward.totalScore == null ? "舊制未計分" : formatInteger(reward.totalScore)}
              tone={reward.totalScore == null ? "text.secondary" : "text.primary"}
            />
            {reward.totalScore == null && (
              <Typography variant="caption" color="text.secondary">
                這個賽季在改制前結算，當時只記錄傷害。
              </Typography>
            )}
            <SummaryStat label="賽季總傷害" value={formatInteger(reward.totalDamage)} />
          </Stack>
          <Box sx={{ bgcolor: "action.hover", borderRadius: 1.5, p: 1.25 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              結算編號
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
            >
              #{reward.rewardId ?? "—"}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              入帳時間{" "}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            >
              {formatDate(reward.paidAt)}
            </Typography>
            {reward.settledAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mt: 0.75 }}
              >
                賽季結算：{formatDate(reward.settledAt)}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function NoRewardCard() {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ py: { xs: 4, sm: 5 }, textAlign: "center" }}>
        <MilitaryTechIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          尚無結算紀錄
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          完成世界王賽季後，個人獎勵會保留在這裡。
        </Typography>
      </CardContent>
    </Card>
  );
}

function UnavailableRewardCard() {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderStyle: "dashed" }}>
      <CardContent sx={{ py: { xs: 4, sm: 5 }, textAlign: "center" }}>
        <MilitaryTechIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          個人結算紀錄暫時無法確認
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          請重新整理後再試；已入帳的獎勵不會因載入失敗而失效。
        </Typography>
      </CardContent>
    </Card>
  );
}

function rankMedal(ranking) {
  if (ranking === 1) return "🥇";
  if (ranking === 2) return "🥈";
  if (ranking === 3) return "🥉";
  return String(ranking ?? "—");
}

function Leaderboard({ rows, unavailable }) {
  const hasRows = rows !== undefined && rows.length > 0;

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack
          direction="row"
          gap={1}
          sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1 }}
        >
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              賽季分數排行榜
            </Typography>
            <Typography variant="body2" color="text.secondary">
              顯示前 50 名 · 分數含溢傷與協作加分
            </Typography>
          </Box>
          <EmojiEventsIcon color="warning" aria-hidden="true" />
        </Stack>

        {unavailable && (
          <Alert severity="warning" variant="outlined" sx={{ mb: hasRows ? 1.5 : 0 }}>
            排行榜暫時無法更新{hasRows ? "，以下顯示上次成功載入的資料。" : "，請重新整理後再試。"}
          </Alert>
        )}
        {hasRows ? (
          <List disablePadding aria-label="世界王分數排行榜">
            {rows.map((row, index) => {
              const ranking = row.ranking;
              return (
                <ListItem
                  key={`${row.user_id || "unknown"}-${index}`}
                  disableGutters
                  divider={index < rows.length - 1}
                >
                  <ListItemAvatar sx={{ minWidth: 44 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        fontSize: ranking <= 3 ? "1.2rem" : "0.875rem",
                        fontWeight: 800,
                        bgcolor: ranking <= 3 ? "transparent" : "action.selected",
                        color: "text.primary",
                      }}
                      aria-label={`第 ${formatInteger(ranking)} 名`}
                    >
                      {rankMedal(ranking)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={row.display_name || row.user_id || "未知玩家"}
                    secondary="賽季總分"
                    primaryTypographyProps={{
                      noWrap: true,
                      sx: { maxWidth: { xs: "calc(100vw - 190px)", sm: "min(50vw, 360px)" } },
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      flex: "0 0 auto",
                      maxWidth: { xs: "42%", sm: "48%" },
                      pl: 1,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      overflowWrap: "anywhere",
                      textAlign: "right",
                    }}
                  >
                    {formatInteger(row.total_score)}
                  </Typography>
                </ListItem>
              );
            })}
          </List>
        ) : !unavailable ? (
          <Box sx={{ py: 5, textAlign: "center" }}>
            <Typography color="text.secondary">目前尚無可顯示的討伐紀錄。</Typography>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Worldboss() {
  const [data, setData] = useState({ status: undefined, leaderboard: undefined, me: undefined });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attackingRoundId, setAttackingRoundId] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooling, setCooling] = useState(false);
  const [lastAttack, setLastAttack] = useState(null);
  const requestIdRef = useRef(0);
  const loadedOnceRef = useRef(false);
  const hasLoadedDataRef = useRef(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const { liffContext } = useLiff();

  const fetchBoard = useCallback(
    async ({ announce = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const isFirstLoad = !loadedOnceRef.current;
      if (isFirstLoad) setLoading(true);
      else setRefreshing(true);

      const results = await Promise.allSettled([
        api.get("/api/world-boss/status"),
        api.get("/api/world-boss/leaderboard?limit=50"),
        api.get("/api/world-boss/me"),
      ]);

      if (requestId !== requestIdRef.current) return;

      const [statusResult, leaderboardResult, meResult] = results;
      const endpointResults = [
        { key: "status", label: "戰況", result: statusResult },
        { key: "leaderboard", label: "排行榜", result: leaderboardResult },
        { key: "me", label: "個人資料", result: meResult },
      ];
      const nextErrors = Object.fromEntries(
        endpointResults
          .filter(({ result }) => result.status === "rejected")
          .map(({ key, result }) => [key, endpointErrorLabel(result.reason)])
      );
      const successfulEndpoints = endpointResults
        .filter(({ result }) => result.status === "fulfilled")
        .map(({ label }) => label);
      const allEndpointsFailed = successfulEndpoints.length === 0;
      const hasLoadedData = hasLoadedDataRef.current;

      setData(previous => ({
        ...previous,
        ...(statusResult.status === "fulfilled" ? { status: statusResult.value.data ?? null } : {}),
        ...(leaderboardResult.status === "fulfilled"
          ? { leaderboard: leaderboardSnapshot(leaderboardResult.value.data) }
          : {}),
        ...(meResult.status === "fulfilled" ? { me: meResult.value.data ?? null } : {}),
      }));
      setErrors(nextErrors);
      loadedOnceRef.current = true;
      if (!allEndpointsFailed) {
        hasLoadedDataRef.current = true;
        setHasLoadedData(true);
      }
      setLoading(false);
      setRefreshing(false);

      if (announce) {
        const failedEndpoints = Object.keys(nextErrors);
        showHint(
          allEndpointsFailed
            ? hasLoadedData
              ? "無法更新世界王資料，以下顯示上次成功載入的資料。"
              : "目前無法載入世界王資料，請稍後再試。"
            : failedEndpoints.length
              ? `部分資料無法更新：${failedEndpoints.join("、")}`
              : `已更新${successfulEndpoints.join("、")}`,
          allEndpointsFailed ? "error" : failedEndpoints.length ? "warning" : "success"
        );
      }
    },
    [showHint]
  );

  useEffect(() => {
    document.title = "世界王戰況";
    fetchBoard();
  }, [fetchBoard]);

  // Re-enables the buttons once the server-side cooldown has elapsed. This only lifts
  // the local lock — it never fires a retry on the user's behalf.
  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = window.setTimeout(
      () => {
        setCooling(false);
        setCooldownUntil(0);
      },
      Math.max(0, cooldownUntil - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [cooldownUntil]);

  const attack = useCallback(
    async (round, attackType) => {
      if (attackingRoundId !== null || cooling) return;
      setAttackingRoundId(round.id);

      const groupId = contextGroupId(liffContext);
      try {
        const { data: payload } = await api.post("/api/world-boss/attack", {
          roundId: round.id,
          attackType,
          ...(groupId ? { groupId } : {}),
        });

        setData(previous => mergeAfterAttack(previous, payload));
        setErrors(previous => {
          const { status: _status, me: _me, ...rest } = previous;
          return rest;
        });
        setLastAttack({ ...payload.attack, announcementQueued: payload.announcementQueued });
        hasLoadedDataRef.current = true;
        setHasLoadedData(true);

        // The board came back with the response; only the ranking is now stale.
        api
          .get("/api/world-boss/leaderboard?limit=50")
          .then(({ data: board }) =>
            setData(previous => ({ ...previous, leaderboard: leaderboardSnapshot(board) }))
          )
          .catch(() => {});

        // A null status means the follow-up read failed server-side, not that the
        // attack failed — refetch so the board doesn't sit on pre-attack HP.
        if (!payload.status) fetchBoard();
      } catch (requestError) {
        const { severity, message } = attackErrorLabel(requestError);
        showHint(message, severity);
        if (requestError.response?.status === 429) {
          setCooling(true);
          setCooldownUntil(Date.now() + COOLDOWN_MS);
        }
        if (requestError.response?.status === 409) fetchBoard();
      } finally {
        setAttackingRoundId(null);
      }
    },
    [attackingRoundId, cooling, liffContext, fetchBoard, showHint]
  );

  if (loading) return <LoadingBoard />;

  const hasBattle = Boolean(
    data.status?.season && Array.isArray(data.status?.rounds) && data.status.rounds.length > 0
  );
  const current = data.me?.current;
  const statusSeasonId = canonicalSeasonId(data.status?.season?.id);
  const currentMatchesStatus = Boolean(
    current &&
    !errors.status &&
    statusSeasonId !== null &&
    canonicalSeasonId(current.seasonId) === statusSeasonId
  );
  const shouldRenderCurrent = currentMatchesStatus;
  const currentUnavailable = !shouldRenderCurrent && (hasBattle || current != null);
  const leaderboard = leaderboardView(data.status, data.leaderboard, errors);
  const latestReward = data.me?.latestReward;
  const errorEntries = Object.entries(errors);
  const allEndpointsFailed = errorEntries.length === 3;

  return (
    <Container maxWidth="lg" sx={{ py: 1 }}>
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
        >
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
              世界王戰況
            </Typography>
            <Typography variant="body2" color="text.secondary">
              全服共鬥 · 即時討伐與個人結算紀錄
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => fetchBoard({ announce: true })}
            // Locked while an attack is in flight or cooling down: a board fetch that
            // started before the attack could land afterwards and overwrite the fresher
            // state the attack response already gave us.
            disabled={refreshing || attackingRoundId !== null || cooling}
            aria-label="重新整理世界王戰況、排行榜與個人資料"
            sx={{ alignSelf: { xs: "flex-start", sm: "auto" }, fontWeight: 700 }}
          >
            重新整理
          </Button>
        </Stack>

        {errorEntries.length > 0 && (
          <Alert
            severity={allEndpointsFailed ? "error" : "warning"}
            variant="outlined"
            aria-live="polite"
          >
            {allEndpointsFailed
              ? hasLoadedData
                ? "目前無法更新世界王資料，以下顯示上次成功載入的資料。"
                : "目前無法載入世界王資料，請稍後再試。"
              : `部分資料無法更新：${errorEntries
                  .map(([name, message]) => `${name}（${message}）`)
                  .join("、")}。現有資料可能不是最新狀態。`}
          </Alert>
        )}

        {lastAttack && (
          <AttackResultCard attack={lastAttack} onDismiss={() => setLastAttack(null)} />
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: hasBattle ? 12 : 7 }}>
            {hasBattle ? (
              <BattleCard
                status={data.status}
                current={shouldRenderCurrent ? current : undefined}
                currentUnavailable={currentUnavailable}
                onAttack={attack}
                attackingRoundId={attackingRoundId}
                locked={attackingRoundId !== null || cooling}
              />
            ) : errors.status || data.status?.season ? (
              <UnavailableStatus />
            ) : (
              <NoActiveSeason />
            )}
          </Grid>
          {shouldRenderCurrent && (
            <Grid size={{ xs: 12, md: 7 }}>
              <EffectHistoryCard effects={current?.effects} />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: shouldRenderCurrent || !hasBattle ? 5 : 12 }}>
            {data.me === undefined ? (
              <UnavailableRewardCard />
            ) : latestReward != null ? (
              <LatestRewardCard reward={latestReward} />
            ) : (
              <NoRewardCard />
            )}
          </Grid>
        </Grid>

        {current != null && !hasBattle && (
          <PersonalProgressCard
            current={shouldRenderCurrent ? current : undefined}
            unavailable={currentUnavailable}
          />
        )}

        <Leaderboard rows={leaderboard.rows} unavailable={leaderboard.unavailable} />
      </Stack>
      <HintSnackBar {...hintState} onClose={closeHint} />
    </Container>
  );
}
