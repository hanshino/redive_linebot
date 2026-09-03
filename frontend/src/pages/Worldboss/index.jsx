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
  Collapse,
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
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import BoltIcon from "@mui/icons-material/Bolt";
import CampaignIcon from "@mui/icons-material/Campaign";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HandshakeIcon from "@mui/icons-material/Handshake";
import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import HistoryToggleOffIcon from "@mui/icons-material/HistoryToggleOff";
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
              effects: foldAttackEffects(current?.effects, attack),
            },
      latestReward: latestReward ?? previous.me?.latestReward ?? null,
    },
  };
}

/**
 * `/me` used to return `effects` as a plain array of what the player left behind. It is now
 * `{ left, taken }`. Both shapes — and a missing one — have to render, because a cached page
 * can outlive a deploy and a blank board is worse than a partial one.
 */
function normalizeEffects(effects) {
  if (Array.isArray(effects)) return { left: effects, taken: [] };
  return {
    left: Array.isArray(effects?.left) ? effects.left : [],
    taken: Array.isArray(effects?.taken) ? effects.taken : [],
  };
}

/**
 * Folds both halves of a hit into the history without a refetch: the effect it left goes to
 * the top of `left`, the effect it took goes to the top of `taken`. One attack can do both.
 *
 * A hit that clears the boss also ends every effect of mine still waiting on that round —
 * the server will say so on the next read, and until then the row would keep claiming it is
 * still up for grabs.
 */
function foldAttackEffects(effects, attack) {
  const { left, taken } = normalizeEffects(effects);
  const created = attack.createdEffect;
  const consumed = attack.consumedEffect;
  const sameRound = effect => String(effect.roundId) === String(attack.roundId);

  const expiredLeft = attack.cleared
    ? left.map(effect =>
        !effect.consumedAt && sameRound(effect) ? { ...effect, expired: true } : effect
      )
    : left;

  return {
    left: created
      ? [
          {
            effectId: created.id,
            type: created.type,
            value: created.value,
            roundId: attack.roundId,
            createdAt: new Date().toISOString(),
            consumedAt: null,
            consumedBy: null,
            expired: false,
          },
          ...expiredLeft.filter(effect => String(effect.effectId) !== String(created.id)),
        ]
      : expiredLeft,
    taken: consumed
      ? [
          {
            effectId: consumed.id,
            type: consumed.type,
            value: consumed.value,
            roundId: attack.roundId,
            takenAt: new Date().toISOString(),
            source: {
              userId: consumed.sourceUserId ?? null,
              displayName: consumed.sourceDisplayName ?? null,
            },
          },
          ...taken.filter(effect => String(effect.effectId) !== String(consumed.id)),
        ]
      : taken,
  };
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

/** The server's base damage formula, from RPGCharacter#getStandardDamage. */
function baseDamage(level) {
  return level * level + level * 10;
}

/**
 * Two example levels, only to make the point that the curve is quadratic: the gap between a
 * new player and a veteran is not proportional to the level gap. The ratio is computed from
 * the same formula rather than written in, so it can never drift from the text beside it.
 */
const DAMAGE_EXAMPLE = { low: 12, high: 140 };
const DAMAGE_EXAMPLE_RATIO = (
  baseDamage(DAMAGE_EXAMPLE.high) / baseDamage(DAMAGE_EXAMPLE.low)
).toFixed(1);

/** One row of the "why the numbers differ" list. `lead` is the dominant factor. */
function FactorRow({ index, title, body, lead }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Box
        sx={theme => ({
          flexShrink: 0,
          width: 20,
          height: 20,
          mt: 0.2,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: "0.7rem",
          fontWeight: 800,
          color: lead ? theme.palette.primary.contrastText : theme.palette.text.secondary,
          bgcolor: lead ? theme.palette.primary.main : alpha(theme.palette.text.disabled, 0.16),
        })}
      >
        {index}
      </Box>
      <Box minWidth={0}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 800, lineHeight: 1.4, ...(lead && { color: "primary.main" }) }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.55 }}
        >
          {body}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * Answers the third question players keep asking — "why is everybody's attack number
 * different" — and, in the always-visible strip above the toggle, the second one: "what job
 * am I". It sits at the end of PersonalStats so it lands directly under the damage figures
 * that prompt the question, in both the in-season card and the off-season one.
 *
 * The strip is open, the mechanics are one tap behind a toggle: the job line is a fact a
 * player wants at a glance, the formula is a thing they want once.
 */
function DamageExplainer({ jobKey, level }) {
  const [open, setOpen] = useState(false);
  const job = JOB_META[jobKey];
  const skill = job?.skill;

  return (
    <Box
      sx={theme => ({
        borderRadius: 2,
        border: "1px solid",
        borderColor: alpha(theme.palette.primary.main, 0.28),
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        overflow: "hidden",
      })}
    >
      {job ? (
        <Box sx={{ px: 1.5, pt: 1.5, pb: 1.25 }}>
          <Stack direction="row" spacing={1.25} alignItems="flex-start">
            <Avatar
              variant="rounded"
              sx={theme => ({
                width: 34,
                height: 34,
                flexShrink: 0,
                bgcolor: alpha(theme.palette.primary.main, 0.16),
                color: "primary.main",
              })}
            >
              <BoltIcon sx={{ fontSize: 20 }} />
            </Avatar>
            <Box minWidth={0} flex={1}>
              <Typography variant="caption" color="text.secondary" display="block">
                我的職業
              </Typography>
              <Stack
                direction="row"
                spacing={0.75}
                alignItems="baseline"
                flexWrap="wrap"
                useFlexGap
              >
                <Typography sx={{ fontWeight: 800, lineHeight: 1.3 }}>{job.name}</Typography>
                {level != null && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                  >
                    Lv.{formatInteger(level)}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.5 }}>
                技能「{skill.name}」· {skill.rate} 倍 · 消耗 {skill.cost}
                {skill.criticalRate ? ` · 暴擊 ${skill.criticalRate}%` : ""}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.25, lineHeight: 1.5 }}
              >
                {job.leaves
                  ? `攻擊後在那隻王身上留下「${job.leaves}」，數值是這刀自身傷害的 ${job.effectPercent}%。`
                  : "攻擊後不會留下效果，分數來自自身傷害與接走別人的效果。"}
              </Typography>
            </Box>
          </Stack>
        </Box>
      ) : null}

      <Button
        fullWidth
        disableRipple
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        aria-controls="damage-explainer-body"
        startIcon={<HelpOutlinedIcon sx={{ fontSize: 18 }} />}
        endIcon={
          <ExpandMoreIcon
            sx={{
              fontSize: 20,
              transition: "transform .2s ease-out",
              transform: open ? "rotate(180deg)" : "none",
            }}
          />
        }
        sx={theme => ({
          justifyContent: "flex-start",
          gap: 0.5,
          px: 1.5,
          py: 1,
          color: "text.primary",
          fontWeight: 700,
          fontSize: "0.8125rem",
          textAlign: "left",
          borderRadius: 0,
          ...(job && {
            borderTop: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.2),
          }),
          "& .MuiButton-endIcon": { ml: "auto" },
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
        })}
      >
        為什麼每個人的攻擊數值差這麼多？
      </Button>

      <Collapse in={open} unmountOnExit>
        <Box
          id="damage-explainer-body"
          sx={theme => ({
            px: 1.5,
            pt: 1.5,
            pb: 1.75,
            borderTop: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.2),
          })}
        >
          <Stack spacing={1.5}>
            <FactorRow
              index={1}
              lead
              title="等級，影響最大"
              body={`基礎傷害 = 等級² + 等級 × 10。等級每上升一級，傷害增加的幅度也跟著變大，所以等級差距造成的傷害差距會遠大於等級本身的倍數。Lv.${DAMAGE_EXAMPLE.low} 的基礎傷害是 ${formatInteger(baseDamage(DAMAGE_EXAMPLE.low))}，Lv.${DAMAGE_EXAMPLE.high} 是 ${formatInteger(baseDamage(DAMAGE_EXAMPLE.high))}，差 ${DAMAGE_EXAMPLE_RATIO} 倍，不是 ${(DAMAGE_EXAMPLE.high / DAMAGE_EXAMPLE.low).toFixed(1)} 倍。`}
            />
            <FactorRow
              index={2}
              title="職業技能倍率"
              body={`基礎傷害再乘上技能倍率。四個職業目前是 ${RATE_RANGE} 倍，同時消耗的行動點也不同，倍率高的通常消耗也高。`}
            />
            <FactorRow
              index={3}
              title="熟練度浮動 ±10%"
              body="每次攻擊都會在基礎傷害上隨機浮動 ±10%，所以同一個人連續打同一隻王，數字也不會完全一樣。"
            />
            <FactorRow
              index={4}
              title="暴擊，只有部分職業有"
              body={`法師有 ${JOB_META.mage.skill.criticalRate}% 機率暴擊，盜賊有 ${JOB_META.thief.skill.criticalRate}%，冒險者和劍士沒有。暴擊會再乘上一個倍率，這是同職業同等級也可能打出好幾倍差距的原因。`}
            />
            <FactorRow
              index={5}
              title="裝備攻擊力加成"
              body="裝備上的攻擊力加成會加在基礎傷害之後。目前多數玩家還沒有裝備，這一項通常是 0。"
            />
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1.75, lineHeight: 1.55 }}
          >
            排行榜排的是分數不是傷害。溢傷全額計分，接力和被接力也會加分，所以傷害低的人不一定分數低。
          </Typography>
        </Box>
      </Collapse>
    </Box>
  );
}

function PersonalStats({ current, unavailable = false, jobLevel }) {
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
      <DamageExplainer jobKey={current?.jobKey} level={jobLevel} />

      {unavailable && (
        <Typography variant="caption" color="warning.main">
          個人資料與目前賽季不同步，請重新整理後再試。
        </Typography>
      )}
    </Stack>
  );
}

/**
 * A left-behind effect is in exactly one of three states, and they are not equally good news.
 * `expired` is the one the board used to hide: the round died before anybody relayed it, so
 * the row is finished — it just never paid out.
 */
const EFFECT_STATUS = {
  claimed: { label: "已接走", Icon: HandshakeIcon },
  waiting: { label: "等人接", Icon: HourglassEmptyIcon },
  expired: { label: "已失效", Icon: HistoryToggleOffIcon },
};

function effectStatus(effect) {
  if (effect.consumedAt) return "claimed";
  return effect.expired ? "expired" : "waiting";
}

/**
 * Job name, skill numbers, and whether the job leaves anything behind at all.
 *
 * Mirrored by hand from the server, because `/api/world-boss/me` returns only `jobKey` —
 * no level, no skill, no effect percentage. Sources, field by field:
 *   - name / skill.name / cost / rate / criticalRate
 *       → app/src/model/application/RPGCharacter.js (each class's `skillOne` getter)
 *   - effectPercent
 *       → app/src/model/application/WorldBossRoundEffect.js (EFFECT_BY_JOB)
 * A skill rebalance on the server has to be re-typed here, so the panel that renders these
 * says where they come from rather than presenting them as live values.
 */
const JOB_META = {
  adventurer: {
    name: "冒險者",
    leaves: "鼓舞",
    effectPercent: 25,
    skill: { name: "奮力揮擊", cost: 8, rate: 1.2 },
  },
  mage: {
    name: "法師",
    leaves: "魔力刻印",
    effectPercent: 50,
    skill: { name: "元素之力", cost: 7, rate: 0.7, criticalRate: 25 },
  },
  swordman: {
    name: "劍士",
    leaves: null,
    skill: { name: "震地斬擊", cost: 10, rate: 1.8 },
  },
  thief: {
    name: "盜賊",
    leaves: null,
    skill: { name: "致命一擊", cost: 20, rate: 2.1, criticalRate: 50 },
  },
};

/** Skill multipliers across all four jobs, for the "職業技能倍率" range in the panel. */
const SKILL_RATES = Object.values(JOB_META).map(job => job.skill.rate);
const RATE_RANGE = `${Math.min(...SKILL_RATES)} ~ ${Math.max(...SKILL_RATES)}`;

/**
 * A swordman or thief never leaves an effect — not "not yet", ever. Telling them the season
 * simply hasn't started for them reads as a bug, so the empty state names the rule and points
 * at the list they do have rows in.
 */
function LeftEmptyState({ jobKey, onSeeTaken }) {
  const job = JOB_META[jobKey];
  const structural = Boolean(job && job.leaves === null);

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
        {structural ? `${job.name}攻擊後不會留下效果。` : "這個賽季還沒有留下任何效果。"}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        {structural
          ? "你的分數來自自身傷害，以及接走別人留下的效果。"
          : job
            ? `${job.name}攻擊後會留下${job.leaves}，等其他玩家來接。`
            : "冒險者攻擊後會留下鼓舞，法師會留下魔力刻印，等其他玩家來接。"}
      </Typography>
      {structural && (
        <Button
          size="small"
          variant="text"
          endIcon={<ArrowForwardIcon />}
          onClick={onSeeTaken}
          sx={{ mt: 1, fontWeight: 700 }}
        >
          看我接走的效果
        </Button>
      )}
    </Box>
  );
}

function TakenEmptyState() {
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
        還沒接走任何人的效果。
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        王身上有「待接力」標記時，攻擊那隻王就會接走一個，但接不到自己留下的。
      </Typography>
    </Box>
  );
}

/** Shared chrome for both lists: colour rail, icon tile, title row, one caption line, chip. */
function EffectRow({ type, muted, rail, tint, hatched, title, caption, chip }) {
  const { label, Icon, tone } = effectMeta(type);

  return (
    <Box
      sx={theme => ({
        position: "relative",
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderStyle: rail === "dashed" ? "dashed" : "solid",
        borderColor: rail === "solid" ? alpha(tone(theme), 0.4) : "divider",
        bgcolor: tint ? alpha(tone(theme), 0.08) : "transparent",
        ...(hatched && {
          backgroundImage: `repeating-linear-gradient(135deg, ${alpha(
            theme.palette.text.disabled,
            0.07
          )} 0 5px, transparent 5px 11px)`,
        }),
        "&::before": {
          content: '""',
          position: "absolute",
          insetBlock: 0,
          insetInlineStart: 0,
          width: 3,
          bgcolor: muted ? alpha(theme.palette.text.disabled, 0.4) : tone(theme),
        },
      })}
    >
      <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ pl: 0.75 }}>
        <Avatar
          variant="rounded"
          sx={theme => ({
            width: 32,
            height: 32,
            bgcolor: muted ? "action.hover" : alpha(tone(theme), 0.18),
            color: muted ? "text.disabled" : tone(theme),
            ...(muted && { filter: "grayscale(1)" }),
          })}
        >
          <Icon sx={{ fontSize: 18 }} />
        </Avatar>
        <Box minWidth={0} flex={1}>
          <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="wrap" useFlexGap>
            <Typography
              variant="body2"
              sx={theme => ({
                fontWeight: 800,
                color: muted ? "text.disabled" : tone(theme),
                ...(muted && { textDecoration: "line-through" }),
              })}
            >
              {label}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
              color={muted ? "text.disabled" : "text.secondary"}
            >
              {formatInteger(title)}
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ overflowWrap: "anywhere" }}
          >
            {caption}
          </Typography>
        </Box>
        {chip}
      </Stack>
    </Box>
  );
}

/**
 * "What I left behind, and what became of it." A player can never consume their own effect,
 * so an unclaimed row is an open invitation, a claimed one is a name — and an expired one is
 * a round that ended first. The expired styling is deliberately grey and struck through
 * rather than red: nothing was done wrong, the window just closed.
 */
function LeftEffectList({ effects, jobKey, onSeeTaken }) {
  if (effects.length === 0) return <LeftEmptyState jobKey={jobKey} onSeeTaken={onSeeTaken} />;

  return (
    <Stack spacing={1}>
      {effects.map(effect => {
        const status = effectStatus(effect);
        const { label: statusLabel, Icon: StatusIcon } = EFFECT_STATUS[status];
        const { tone } = effectMeta(effect.type);
        const claimed = status === "claimed";
        const expired = status === "expired";
        const taker = effect.consumedBy?.displayName || effect.consumedBy?.userId || "某位玩家";

        return (
          <EffectRow
            key={effect.effectId}
            type={effect.type}
            muted={expired}
            rail={claimed ? "solid" : expired ? "muted" : "dashed"}
            tint={claimed}
            hatched={expired}
            title={effect.value}
            caption={
              claimed ? (
                <>
                  被 <b>{taker}</b> 接走 · {formatDate(effect.consumedAt)}
                </>
              ) : expired ? (
                <>這隻王在有人接走前就被打倒了 · 留於 {formatDate(effect.createdAt)}</>
              ) : (
                <>還掛在王身上 · 留於 {formatDate(effect.createdAt)}</>
              )
            }
            chip={
              <Chip
                size="small"
                icon={<StatusIcon sx={{ fontSize: 14 }} />}
                label={statusLabel}
                variant={claimed ? "filled" : "outlined"}
                sx={theme => ({
                  flexShrink: 0,
                  fontWeight: 700,
                  height: 24,
                  ...(claimed
                    ? { bgcolor: alpha(tone(theme), 0.16), color: tone(theme) }
                    : expired
                      ? { color: "text.disabled", borderStyle: "dashed" }
                      : { color: "text.secondary" }),
                })}
              />
            }
          />
        );
      })}
    </Stack>
  );
}

/**
 * "What I picked up off a boss." Every row here is settled by definition — it was consumed
 * the moment it was taken — so the chip carries what the pickup actually did instead of
 * repeating the tab name: a banner scores for both sides, a seal turns into damage and its
 * score goes back to the mage who left it.
 */
function TakenEffectList({ effects }) {
  if (effects.length === 0) return <TakenEmptyState />;

  return (
    <Stack spacing={1}>
      {effects.map(effect => {
        const { tone } = effectMeta(effect.type);
        const banner = effect.type === "banner";

        return (
          <EffectRow
            key={effect.effectId}
            type={effect.type}
            rail="solid"
            tint
            title={effect.value}
            caption={
              <>
                接自 <b>{effect.source?.displayName || effect.source?.userId || "某位玩家"}</b> ·{" "}
                {formatDate(effect.takenAt)}
              </>
            }
            chip={
              <Chip
                size="small"
                icon={
                  banner ? (
                    <ArrowForwardIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <BoltIcon sx={{ fontSize: 14 }} />
                  )
                }
                label={banner ? "接力加分" : "轉成傷害"}
                sx={theme => ({
                  flexShrink: 0,
                  fontWeight: 700,
                  height: 24,
                  bgcolor: alpha(banner ? theme.palette.success.main : tone(theme), 0.16),
                  color: banner ? theme.palette.success.main : tone(theme),
                })}
              />
            }
          />
        );
      })}
    </Stack>
  );
}

/**
 * Both halves of the relay in one card, on tabs rather than stacked: on a phone two full
 * lists back to back means the second one is never seen, and two separate cards double the
 * scroll. The tab a player lands on depends on their job — a swordman has nothing in "我留下的"
 * and never will, so opening there would be an empty screen every single time.
 */
function EffectHistoryCard({ effects, jobKey }) {
  const { left, taken } = normalizeEffects(effects);
  const leavesNothing = JOB_META[jobKey]?.leaves === null;
  // ponytail: jobKey is present whenever this card mounts (it ships in the same `current`
  // object the parent gates on), so the initial tab never needs to re-derive.
  const [tab, setTab] = useState(leavesNothing ? "taken" : "left");

  const claimed = left.filter(effect => effectStatus(effect) === "claimed").length;
  const expired = left.filter(effect => effectStatus(effect) === "expired").length;
  const waiting = left.length - claimed - expired;

  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={1.75}>
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              效果接力紀錄
            </Typography>
            <Typography variant="body2" color="text.secondary">
              效果只在留下它的那隻王身上，王被打倒就跟著結束。
            </Typography>
          </Box>

          <Tabs
            value={tab}
            onChange={(_event, next) => setTab(next)}
            variant="fullWidth"
            aria-label="效果接力紀錄"
            sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, fontWeight: 700 } }}
          >
            <Tab value="left" id="effect-tab-left" label={`我留下的 ${left.length}`} />
            <Tab value="taken" id="effect-tab-taken" label={`我接走的 ${taken.length}`} />
          </Tabs>

          <Box role="tabpanel" aria-labelledby={`effect-tab-${tab}`}>
            {tab === "left" ? (
              <Stack spacing={1.25}>
                {left.length > 0 && (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    <StatusTally label="已接走" count={claimed} tone="secondary.main" />
                    <StatusTally label="等人接" count={waiting} tone="text.secondary" />
                    <StatusTally label="已失效" count={expired} tone="text.disabled" />
                  </Stack>
                )}
                <LeftEffectList effects={left} jobKey={jobKey} onSeeTaken={() => setTab("taken")} />
                {expired > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    王被打倒後，還沒被接走的效果就不會再有人接，這部分不計分。血量還多的王留下的效果，比較有機會被接走。
                  </Typography>
                )}
              </Stack>
            ) : (
              <Stack spacing={1.25}>
                <TakenEffectList effects={taken} />
                {taken.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    接走鼓舞時你和對方都得分；接走魔力刻印會轉成傷害，那份分數歸留下的人。
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function StatusTally({ label, count, tone }) {
  return (
    <Typography
      variant="caption"
      sx={{ fontWeight: 700, color: tone, fontVariantNumeric: "tabular-nums" }}
    >
      {label} {count}
    </Typography>
  );
}

function PersonalProgressCard({ current, unavailable, jobLevel }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
            個人討伐進度
          </Typography>
          <PersonalStats current={current} unavailable={unavailable} jobLevel={jobLevel} />
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
              {/*
                One action, not two. The standard attack was strictly dominated — every job's
                skill dealt at least as much damage per cost and left the same effects — so the
                second button was a choice with only one right answer. `attackType` stays a
                parameter because the server still accepts "standard" from older Flex cards.
              */}
              <Button
                variant="contained"
                fullWidth
                disabled={disabled}
                onClick={() => onAttack(round, "skill")}
                startIcon={
                  busy ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <BoltIcon sx={{ fontSize: 20 }} />
                  )
                }
                sx={theme => ({
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  minHeight: 46,
                  borderRadius: 2,
                  letterSpacing: "0.05em",
                  boxShadow: `0 2px 10px ${alpha(theme.palette.primary.main, 0.35)}`,
                  "&:hover": {
                    boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.45)}`,
                  },
                  "&.Mui-disabled": { boxShadow: "none" },
                })}
              >
                攻擊
              </Button>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function BattleCard({
  status,
  current,
  currentUnavailable,
  onAttack,
  attackingRoundId,
  locked,
  jobLevel,
}) {
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

          <PersonalStats current={current} unavailable={currentUnavailable} jobLevel={jobLevel} />

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
  // `/api/world-boss/me` carries the level, so it is known on first paint. An attack response
  // also carries `levelResult.newLevel`, which is fresher after a level-up; it wins when set.
  // Kept out of `lastAttack` so dismissing the result card does not drop it.
  const [attackedLevel, setAttackedLevel] = useState(null);
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
        const newLevel = Number(payload.attack?.levelResult?.newLevel);
        if (Number.isSafeInteger(newLevel) && newLevel > 0) setAttackedLevel(newLevel);
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
  // `/me` carries the level on first paint; an attack that levels up is fresher, so it wins.
  const meLevel = Number(current?.level);
  const jobLevel = attackedLevel ?? (Number.isSafeInteger(meLevel) && meLevel > 0 ? meLevel : null);
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
                jobLevel={jobLevel}
              />
            ) : errors.status || data.status?.season ? (
              <UnavailableStatus />
            ) : (
              <NoActiveSeason />
            )}
          </Grid>
          {shouldRenderCurrent && (
            <Grid size={{ xs: 12, md: 7 }}>
              <EffectHistoryCard effects={current?.effects} jobKey={current?.jobKey} />
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
            jobLevel={jobLevel}
          />
        )}

        <Leaderboard rows={leaderboard.rows} unavailable={leaderboard.unavailable} />
      </Stack>
      <HintSnackBar {...hintState} onClose={closeHint} />
    </Container>
  );
}
