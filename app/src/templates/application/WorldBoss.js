const config = require("config");
const { FEATURE, SEMANTIC, SURFACE } = require("../common/theme");

const ATTACK_COOLDOWN_SECONDS = config.get("worldboss.attack_cooldown_seconds");
const ACCENT = FEATURE.worldBoss;

function textNode(text, extra = {}) {
  return { type: "text", text, color: SURFACE.text, wrap: true, size: "sm", ...extra };
}

function detailRow(label, value, valueColor = SURFACE.text) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      textNode(label, { color: SURFACE.textMuted, size: "xs", flex: 1 }),
      textNode(value, { color: valueColor, size: "xs", align: "end", flex: 2 }),
    ],
  };
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : String(value);
}

function worldBossUri(liffUri) {
  let uri;
  try {
    uri = new URL(liffUri);
  } catch (error) {
    throw new Error("INVALID_LIFF_URI", { cause: error });
  }
  const path = uri.pathname.replace(/\/$/, "");
  uri.pathname = path.endsWith("/worldboss") ? path : `${path}/worldboss`;
  return uri.toString();
}

function attackAction(attackType) {
  return {
    type: "postback",
    label: attackType === "skill" ? "技能攻擊" : "普通攻擊",
    displayText: attackType === "skill" ? "世界王技能攻擊" : "世界王普通攻擊",
    data: JSON.stringify({
      action: "worldBossAttack",
      attackType,
      cooldown: ATTACK_COOLDOWN_SECONDS,
    }),
  };
}

function validateRound(round) {
  const maxHp = Number(round && round.max_hp);
  const currentHp = Number(round && round.current_hp);
  if (!Number.isFinite(maxHp) || maxHp <= 0) throw new Error("INVALID_MAX_HP");
  if (!Number.isFinite(currentHp) || currentHp < 0 || currentHp > maxHp) {
    throw new Error("INVALID_CURRENT_HP");
  }
  return { maxHp, currentHp };
}

function generateBattleStatusBubble({ season, round, boss, daily, liffUri }) {
  const { maxHp, currentHp } = validateRound(round);
  const hpPercent = Math.round((currentHp / maxHp) * 100);
  const remaining = Number(daily && daily.remaining);
  const dailyLimit = Number(daily && daily.limit);
  const dailyUsed = Number(daily && daily.used);

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: ACCENT.main,
      paddingAll: "md",
      contents: [
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
        textNode(`第 ${round.round_no} 輪 · ${boss.name}`, { weight: "bold", size: "lg" }),
        ...(boss.description
          ? [textNode(boss.description, { color: SURFACE.textMuted, size: "xs" })]
          : []),
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
        { type: "separator", color: SURFACE.dividerMuted, margin: "md" },
        detailRow(
          "今日可用女神石",
          Number.isFinite(remaining) ? `${formatNumber(remaining)}` : "--",
          ACCENT.main
        ),
        detailRow(
          "今日已消耗",
          Number.isFinite(dailyUsed) && Number.isFinite(dailyLimit)
            ? `${formatNumber(dailyUsed)} / ${formatNumber(dailyLimit)}`
            : "--"
        ),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: ACCENT.main,
              height: "sm",
              action: attackAction("standard"),
              flex: 1,
            },
            {
              type: "button",
              style: "secondary",
              color: SEMANTIC.warning.main,
              height: "sm",
              action: attackAction("skill"),
              flex: 1,
            },
          ],
        },
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

function generateAttackResultBubble({ result, daily, latestReward }) {
  const clearedRounds = Array.isArray(result.clearedRounds) ? result.clearedRounds : [];
  const resultRows = [
    detailRow("本次傷害", formatNumber(result.damage), SEMANTIC.success.main),
    detailRow("消耗女神石", formatNumber(result.cost), SEMANTIC.warning.main),
    detailRow("賽季累積傷害", formatNumber(result.seasonTotalDamage)),
    detailRow(
      "今日剩餘女神石額度",
      Number.isFinite(Number(daily && daily.remaining)) ? formatNumber(daily.remaining) : "--",
      ACCENT.main
    ),
  ];

  if (clearedRounds.length) {
    resultRows.push(
      detailRow(
        "已擊破",
        `第 ${clearedRounds.map(formatNumber).join("、")} 輪`,
        SEMANTIC.success.main
      )
    );
  }
  if (result.levelResult && result.levelResult.levelUp) {
    resultRows.push(
      detailRow(
        "職業等級提升",
        `Lv.${formatNumber(result.levelResult.newLevel)}`,
        SEMANTIC.success.main
      )
    );
  }
  if (latestReward) {
    resultRows.push(detailRow("最近結算", `第 ${formatNumber(latestReward.ranking)} 名`));
  }

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      backgroundColor: SEMANTIC.success.main,
      contents: [textNode("世界王攻擊成功", { color: SEMANTIC.success.contrast, weight: "bold" })],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      spacing: "sm",
      contents: resultRows,
    },
  };
}

function generateLatestRewardBubble({ reward, liffUri }) {
  const titleName = reward.titleName || "無稱號";
  const paidAt = String(reward.paidAt);

  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      backgroundColor: SEMANTIC.warning.main,
      contents: [
        textNode("最新世界王結算", {
          color: SEMANTIC.warning.contrast,
          weight: "bold",
          size: "md",
        }),
        textNode(reward.seasonName, { color: SEMANTIC.warning.contrast, size: "xs", margin: "xs" }),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      spacing: "sm",
      contents: [
        textNode(`第 ${formatNumber(reward.ranking)} 名`, {
          color: SEMANTIC.warning.dark,
          weight: "bold",
          size: "xl",
        }),
        detailRow("女神石", formatNumber(reward.stoneAmount), SEMANTIC.warning.main),
        detailRow("稱號", titleName),
        detailRow("賽季總傷害", formatNumber(reward.totalDamage)),
        { type: "separator", color: SURFACE.dividerMuted, margin: "md" },
        textNode(`結算編號 #${reward.rewardId}`, { color: SURFACE.textMuted, size: "xs" }),
        textNode(`入帳時間 ${paidAt}`, { color: SURFACE.textMuted, size: "xs" }),
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

function generateWorldBossReply({ status, daily, latestReward, liffUri }) {
  const active = Boolean(status && !status.ended && status.season && status.round && status.boss);
  const bubbles = [];
  if (active) bubbles.push(generateBattleStatusBubble({ ...status, daily, liffUri }));
  if (latestReward) bubbles.push(generateLatestRewardBubble({ reward: latestReward, liffUri }));
  if (!bubbles.length)
    return generateNoActiveSeasonBubble({ ended: Boolean(status && status.ended), liffUri });
  return bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles };
}

module.exports = {
  generateBattleStatusBubble,
  generateAttackResultBubble,
  generateLatestRewardBubble,
  generateWorldBossReply,
  generateNoActiveSeasonBubble,
};
