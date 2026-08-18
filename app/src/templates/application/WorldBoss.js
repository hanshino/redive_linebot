const { FEATURE, SEMANTIC, SURFACE } = require("../common/theme");

const MAX_BOSS_DESCRIPTION_BYTES = 2048;
const MAX_IMAGE_URL_LENGTH = 2000;
const ACCENT = FEATURE.worldBoss;
// White veil over a cleared boss's art. LINE accepts #RRGGBBAA, so the alpha does the
// fading without needing an image filter (Flex images have no opacity property).
const CLEARED_VEIL = `${SURFACE.bg}B3`;

function textNode(text, extra = {}) {
  return { type: "text", text, color: SURFACE.text, wrap: true, size: "sm", ...extra };
}

function formatNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : String(value);
  }
  if (typeof value === "bigint") return value.toLocaleString("en-US");
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return String(value);

  const negative = value.startsWith("-");
  const digits = value.slice(negative ? 1 : 0).replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function worldBossUri(liffUri) {
  let uri;
  try {
    uri = new URL(liffUri);
  } catch (error) {
    throw new Error("INVALID_LIFF_URI", { cause: error });
  }
  if (uri.protocol !== "https:") throw new Error("INVALID_LIFF_URI");
  const path = uri.pathname.replace(/\/$/, "");
  uri.pathname = path.endsWith("/worldboss") ? path : `${path}/worldboss`;
  return uri.toString();
}

/**
 * LINE rejects the whole message if an image url is malformed or non-HTTPS, so an
 * unusable snapshot url has to drop the component rather than fail the bubble.
 */
function httpsImageUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  return url.protocol === "https:" ? url.toString() : null;
}

/**
 * Boss art comes from the season snapshot (`round.image`), never the live catalog,
 * so a bubble always shows the boss as it was when the season opened.
 */
function bossHero(image, cleared) {
  const url = httpsImageUrl(image);
  if (!url) return null;

  const hero = {
    type: "image",
    url,
    size: "full",
    aspectRatio: "20:13",
    aspectMode: "cover",
  };
  if (!cleared) return hero;

  // Keep the art on cleared cards but push it back behind a translucent overlay.
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "none",
    contents: [
      hero,
      {
        type: "box",
        layout: "vertical",
        position: "absolute",
        width: "100%",
        height: "100%",
        backgroundColor: CLEARED_VEIL,
        contents: [],
      },
    ],
  };
}

function truncateUtf8(value, maxBytes) {
  const text = String(value || "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

  let bytes = 0;
  let truncated = "";
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes - Buffer.byteLength("…", "utf8")) break;
    truncated += character;
    bytes += characterBytes;
  }
  return `${truncated}…`;
}

function decimalToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function roundedPercent(numerator, denominator) {
  return Number((numerator * 100n + denominator / 2n) / denominator);
}

function validateRound(round) {
  const maxHp = decimalToBigInt(round && round.max_hp);
  const currentHp = decimalToBigInt(round && round.current_hp);
  if (maxHp === null || maxHp <= 0n) throw new Error("INVALID_MAX_HP");
  if (currentHp === null || currentHp < 0n || currentHp > maxHp) {
    throw new Error("INVALID_CURRENT_HP");
  }
  return { maxHp, currentHp };
}

/**
 * A public group card. Every field here is shared world state — season, cycle, boss
 * snapshot, HP, cleared. No viewer-specific data (quota, EXP, rewards, personal
 * damage) may be added; the LIFF board is where personal state belongs.
 */
function generateBattleStatusBubble({ season, round, boss, liffUri }) {
  const { maxHp, currentHp } = validateRound(round);
  const hpPercent = roundedPercent(currentHp, maxHp);
  const description = truncateUtf8(boss.description, MAX_BOSS_DESCRIPTION_BYTES);
  const cleared = currentHp === 0n || Boolean(round.cleared_at);
  const hero = bossHero(boss.image, cleared);

  return {
    type: "bubble",
    size: "kilo",
    ...(hero ? { hero } : {}),
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: ACCENT.main,
      paddingAll: "md",
      contents: cleared
        ? [textNode("已擊破", { color: SEMANTIC.success.main, weight: "bold", align: "center" })]
        : [
            textNode("世界王討伐中", { color: ACCENT.contrast, weight: "bold", size: "md" }),
            textNode(season.name, { color: ACCENT.contrast, size: "xs", margin: "xs" }),
          ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      spacing: "sm",
      contents: [
        textNode(`第 ${round.cycle_no} 輪 · ${boss.position} 號 · ${boss.name}`, {
          weight: "bold",
          size: "lg",
        }),
        ...(description ? [textNode(description, { color: SURFACE.textMuted, size: "xs" })] : []),
        textNode(`HP ${formatNumber(currentHp)} / ${formatNumber(maxHp)}（${hpPercent}%）`, {
          margin: "md",
          weight: "bold",
          color: ACCENT.main,
        }),
        {
          type: "box",
          layout: "vertical",
          height: "8px",
          backgroundColor: SURFACE.bgMuted,
          cornerRadius: "4px",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: `${hpPercent}%`,
              height: "8px",
              backgroundColor: ACCENT.main,
              cornerRadius: "4px",
              contents: [],
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      spacing: "sm",
      contents: cleared
        ? [textNode("已擊破", { color: SEMANTIC.success.main, weight: "bold", align: "center" })]
        : [
            {
              type: "button",
              style: "primary",
              color: ACCENT.main,
              height: "sm",
              action: { type: "uri", label: "開啟戰況板", uri: worldBossUri(liffUri) },
            },
          ],
    },
  };
}

function generateNoActiveSeasonBubble({ ended, liffUri }) {
  const headline = ended ? "世界王賽季已結束" : "目前沒有進行中的世界王賽季";
  const detail = ended ? "結算完成後可在戰況頁查看最新結果。" : "敬請期待下一次全服討伐。";

  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      spacing: "sm",
      contents: [
        textNode(headline, { weight: "bold", size: "lg", color: SURFACE.text }),
        textNode(detail, { color: SURFACE.textMuted, size: "sm" }),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "button",
          style: "link",
          color: SEMANTIC.info.main,
          height: "sm",
          action: { type: "uri", label: "查看世界王戰況", uri: worldBossUri(liffUri) },
        },
      ],
    },
  };
}

/**
 * The `#世界王` group reply. Public state only — the settled-reward card and the
 * attack-result card were personal state and now live in LIFF, so this returns
 * either the five-boss board or the no-season notice and nothing else.
 */
function generateWorldBossReply({ status, liffUri }) {
  const active = Boolean(
    status &&
    !status.ended &&
    status.season &&
    Array.isArray(status.rounds) &&
    status.rounds.length === 5
  );
  if (!active) {
    return generateNoActiveSeasonBubble({ ended: Boolean(status && status.ended), liffUri });
  }
  return {
    type: "carousel",
    contents: status.rounds
      .slice()
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map(round =>
        generateBattleStatusBubble({ season: status.season, round, boss: round, liffUri })
      ),
  };
}

module.exports = {
  generateBattleStatusBubble,
  generateWorldBossReply,
  generateNoActiveSeasonBubble,
};
