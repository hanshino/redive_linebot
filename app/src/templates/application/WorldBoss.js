const { PALETTE } = require("../common/theme");

const MAX_BOSS_DESCRIPTION_BYTES = 2048;
const MAX_IMAGE_URL_LENGTH = 2000;
// A 1% sliver is invisible at kilo width, so a live boss always keeps a readable stub.
const MIN_HP_BAR_PERCENT = 2;

/**
 * "戰報卡" palette. These are dark-surface values with alpha channels that the shared
 * light-surface tokens don't carry, so they live here rather than in theme.js — this
 * template is their only consumer. Values that do exist in the shared palette are
 * referenced from it so the red / green / amber stay in sync with the rest of the bot.
 */
const C = {
  surface: "#131822",
  text: "#E8EDF5",
  textMuted: "#8A98AD",
  textFaint: "#7C8AA0",
  white: PALETTE.white,

  chipBg: "#000000A6",
  scrimEnd: "#13182200",
  clearedVeil: "#0A0F16D9",

  cleared: "#34D399",
  clearedStampBg: "#04170FA6",
  clearedPanelBg: "#0E2D1FCC",
  clearedPanelBorder: "#1E5E42",
  clearedPanelMuted: "#6E8A7E",

  track: "#FFFFFF14",
  outline: "#FFFFFF29",

  attack: PALETTE.red600,
  skill: "#273246",
  link: "#8CC6FF",
  stripEnd: PALETTE.amber500,
};

/**
 * HP tiers double as the card's status read: green is safe, amber is halfway, rose is
 * nearly down. Ordered high to low; the last entry catches 0% on a boss that is still
 * alive (a rounding artefact on a huge HP pool), which must not fall through.
 */
const HP_TIERS = [
  { above: 60, text: PALETTE.green400, from: "#15803D", to: PALETTE.green400 },
  { above: 30, text: PALETTE.amber400, from: "#B45309", to: PALETTE.amber400 },
  { above: -Infinity, text: "#FB7185", from: "#9F1239", to: "#FB7185" },
];

function hpTier(percent) {
  return HP_TIERS.find(tier => percent > tier.above);
}

function formatNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : String(value);
  }
  if (typeof value === "bigint") return new Intl.NumberFormat("en-US").format(value);
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

/** Bottom-up scrim so the boss name stays legible over any artwork. */
function heroScrim() {
  return {
    type: "box",
    layout: "vertical",
    position: "absolute",
    offsetStart: "0px",
    offsetEnd: "0px",
    offsetBottom: "0px",
    height: "64%",
    background: {
      type: "linearGradient",
      angle: "0deg",
      startColor: C.surface,
      endColor: C.scrimEnd,
    },
    contents: [],
  };
}

/** Cycle + slot badge, pinned top-left. `flex: 0` keeps the pill hugging its label. */
function heroChip(label) {
  return {
    type: "box",
    layout: "horizontal",
    position: "absolute",
    offsetTop: "8px",
    offsetStart: "8px",
    offsetEnd: "8px",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 0,
        backgroundColor: C.chipBg,
        cornerRadius: "4px",
        paddingTop: "3px",
        paddingBottom: "3px",
        paddingStart: "7px",
        paddingEnd: "7px",
        contents: [{ type: "text", text: label, size: "xxs", color: C.white }],
      },
      { type: "filler" },
    ],
  };
}

function heroName(name) {
  return {
    type: "text",
    text: name,
    position: "absolute",
    offsetStart: "12px",
    offsetEnd: "12px",
    offsetBottom: "8px",
    size: "xl",
    weight: "bold",
    color: C.white,
  };
}

function clearedStamp() {
  return {
    type: "box",
    layout: "vertical",
    position: "absolute",
    offsetTop: "0px",
    offsetBottom: "0px",
    offsetStart: "0px",
    offsetEnd: "0px",
    justifyContent: "center",
    alignItems: "center",
    contents: [
      {
        type: "box",
        layout: "vertical",
        borderWidth: "2px",
        borderColor: C.cleared,
        cornerRadius: "4px",
        backgroundColor: C.clearedStampBg,
        paddingTop: "7px",
        paddingBottom: "7px",
        paddingStart: "16px",
        paddingEnd: "16px",
        contents: [{ type: "text", text: "已擊破", size: "md", weight: "bold", color: C.cleared }],
      },
    ],
  };
}

/**
 * Boss art comes from the season snapshot (`round.image`), never the live catalog,
 * so a bubble always shows the boss as it was when the season opened. The cycle label
 * and boss name ride on top of the art; when the url is unusable the whole hero is
 * dropped and `bodyTitle` carries them instead.
 */
function bossHero({ image, cleared, label, name }) {
  const url = httpsImageUrl(image);
  if (!url) return null;

  return {
    type: "box",
    layout: "vertical",
    paddingAll: "none",
    contents: [
      { type: "image", url, size: "full", aspectRatio: "20:13", aspectMode: "cover" },
      // Flex images have no opacity property, so a cleared boss is dimmed by a real box.
      ...(cleared
        ? [
            {
              type: "box",
              layout: "vertical",
              position: "absolute",
              width: "100%",
              height: "100%",
              backgroundColor: C.clearedVeil,
              contents: [],
            },
          ]
        : []),
      heroScrim(),
      heroChip(label),
      heroName(name),
      ...(cleared ? [clearedStamp()] : []),
    ],
  };
}

/** Fallback header for bubbles that lost their hero to an unusable snapshot url. */
function bodyTitle(label, name) {
  return [
    { type: "text", text: label, size: "xxs", color: C.textMuted },
    {
      type: "text",
      text: name,
      size: "xl",
      weight: "bold",
      color: C.text,
      wrap: true,
      margin: "xs",
    },
  ];
}

function hpBlock({ currentHp, maxHp, percent }) {
  const tier = hpTier(percent);

  return {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        alignItems: "flex-end",
        contents: [
          {
            type: "text",
            size: "3xl",
            weight: "bold",
            flex: 0,
            contents: [
              {
                type: "span",
                text: String(percent),
                size: "3xl",
                weight: "bold",
                color: tier.text,
              },
              { type: "span", text: "%", size: "sm", weight: "bold", color: tier.text },
            ],
          },
          {
            type: "text",
            text: `${formatNumber(currentHp)}\n/ ${formatNumber(maxHp)}`,
            size: "xxs",
            color: C.textFaint,
            align: "end",
            gravity: "bottom",
            wrap: true,
            flex: 1,
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        height: "14px",
        cornerRadius: "7px",
        backgroundColor: C.track,
        margin: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: `${Math.max(percent, MIN_HP_BAR_PERCENT)}%`,
            height: "14px",
            cornerRadius: "7px",
            background: {
              type: "linearGradient",
              angle: "90deg",
              startColor: tier.from,
              endColor: tier.to,
            },
            backgroundColor: tier.from,
            contents: [],
          },
        ],
      },
    ],
  };
}

function clearedPanel(maxHp) {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    backgroundColor: C.clearedPanelBg,
    borderWidth: "1px",
    borderColor: C.clearedPanelBorder,
    cornerRadius: "6px",
    paddingTop: "9px",
    paddingBottom: "9px",
    paddingStart: "11px",
    paddingEnd: "11px",
    contents: [
      { type: "text", text: "✓ 討伐完成", size: "sm", weight: "bold", color: C.cleared, flex: 0 },
      {
        type: "text",
        text: `0 / ${formatNumber(maxHp)}`,
        size: "xxs",
        color: C.clearedPanelMuted,
        align: "end",
        gravity: "center",
        flex: 1,
      },
    ],
  };
}

function pendingEffectsRow(pendingEffects) {
  const labels = [
    ["banner", "鼓舞"],
    ["seal", "魔力刻印"],
  ]
    .filter(([type]) => Number(pendingEffects?.[type]) > 0)
    .map(([type, label]) => `${label} ×${Number(pendingEffects[type])}`);
  return labels.length
    ? { type: "text", text: `待接力：${labels.join("、")}`, size: "xs", color: C.textMuted }
    : null;
}

/** A `link` button has no border of its own, so an outline box supplies one. */
function outlineButton(label, uri) {
  return {
    type: "box",
    layout: "vertical",
    borderWidth: "1px",
    borderColor: C.outline,
    cornerRadius: "6px",
    contents: [
      {
        type: "button",
        style: "link",
        color: C.link,
        height: "sm",
        action: { type: "uri", label, uri },
      },
    ],
  };
}

// Only one attack action exists in the UI. The postback still sends attackType:
// "skill" — the backend keeps accepting the retired "standard" value purely so old
// Flex cards already sitting in LINE chat history don't silently stop responding.
function attackRow(roundId) {
  return {
    type: "button",
    style: "primary",
    color: C.attack,
    height: "sm",
    action: {
      type: "postback",
      label: "⚔️ 攻擊",
      data: JSON.stringify({ action: "worldBossAttack", roundId, attackType: "skill" }),
    },
  };
}

/**
 * A public group card. Every field here is shared world state — season, cycle, boss
 * snapshot, HP, cleared. No viewer-specific data (quota, EXP, rewards, personal
 * damage) may be added; the LIFF board is where personal state belongs.
 *
 * `season` is still accepted by the caller but is deliberately not rendered: the
 * carousel shows five cards of the same season, so repeating its name five times
 * spends the card's largest type on the least useful word.
 */
function generateBattleStatusBubble({ round, boss, liffUri, attackEnabled = false }) {
  const { maxHp, currentHp } = validateRound(round);
  const hpPercent = roundedPercent(currentHp, maxHp);
  const description = truncateUtf8(boss.description, MAX_BOSS_DESCRIPTION_BYTES);
  const cleared = currentHp === 0n || Boolean(round.cleared_at);
  const label = `第 ${round.cycle_no} 輪 · ${boss.position} 號`;
  const hero = bossHero({ image: boss.image, cleared, label, name: boss.name });
  const boardUri = worldBossUri(liffUri);
  const pendingEffects = !cleared ? pendingEffectsRow(round.pending_effects) : null;

  return {
    type: "bubble",
    size: "kilo",
    styles: {
      body: { backgroundColor: C.surface },
      footer: { backgroundColor: C.surface, separator: false },
    },
    ...(hero ? { hero } : {}),
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: C.surface,
      paddingAll: "12px",
      paddingBottom: "16px",
      spacing: "lg",
      contents: [
        ...(hero
          ? []
          : [{ type: "box", layout: "vertical", contents: bodyTitle(label, boss.name) }]),
        ...(description
          ? [
              {
                type: "text",
                text: description,
                size: "xs",
                color: C.textMuted,
                wrap: true,
                maxLines: 2,
              },
            ]
          : []),
        cleared ? clearedPanel(maxHp) : hpBlock({ currentHp, maxHp, percent: hpPercent }),
        ...(pendingEffects ? [pendingEffects] : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: C.surface,
      paddingTop: "8px",
      paddingBottom: "12px",
      paddingStart: "12px",
      paddingEnd: "12px",
      spacing: "sm",
      contents:
        !cleared && attackEnabled
          ? [
              attackRow(round.id),
              {
                type: "button",
                style: "link",
                color: C.link,
                height: "sm",
                action: { type: "uri", label: "開啟戰況板", uri: boardUri },
              },
            ]
          : [outlineButton("開啟戰況板", boardUri)],
    },
  };
}

function generateNoActiveSeasonBubble({ ended, liffUri }) {
  const headline = ended ? "世界王賽季已結束" : "目前沒有進行中的世界王賽季";
  const detail = ended ? "結算完成後可在戰況頁查看最新結果。" : "敬請期待下一次全服討伐。";

  return {
    type: "bubble",
    size: "kilo",
    styles: {
      body: { backgroundColor: C.surface },
      footer: { backgroundColor: C.surface, separator: false },
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: C.surface,
      paddingAll: "0px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          height: "4px",
          background: {
            type: "linearGradient",
            angle: "90deg",
            startColor: C.attack,
            endColor: C.stripEnd,
          },
          backgroundColor: C.attack,
          contents: [],
        },
        {
          type: "box",
          layout: "vertical",
          paddingTop: "16px",
          paddingBottom: "20px",
          paddingStart: "12px",
          paddingEnd: "12px",
          spacing: "sm",
          contents: [
            { type: "text", text: headline, size: "md", weight: "bold", color: C.text, wrap: true },
            { type: "text", text: detail, size: "xs", color: C.textMuted, wrap: true },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: C.surface,
      paddingTop: "8px",
      paddingBottom: "12px",
      paddingStart: "12px",
      paddingEnd: "12px",
      contents: [outlineButton("查看世界王戰況", worldBossUri(liffUri))],
    },
  };
}

/**
 * The `#世界王` group reply. Public state only — the settled-reward card and the
 * attack-result card were personal state and now live in LIFF, so this returns
 * either the five-boss board or the no-season notice and nothing else.
 */
function generateWorldBossReply({ status, liffUri, attackEnabled = false }) {
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
        generateBattleStatusBubble({
          season: status.season,
          round,
          boss: round,
          liffUri,
          attackEnabled,
        })
      ),
  };
}

module.exports = {
  generateBattleStatusBubble,
  generateWorldBossReply,
  generateNoActiveSeasonBubble,
};
