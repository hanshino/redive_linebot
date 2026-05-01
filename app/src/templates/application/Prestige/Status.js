// LINE Flex bubble for `#轉生狀態` — single bubble that adapts to 4 scenarios:
// honeymoon (no prestige), in-trial, ready (passed trial waiting to consume),
// awakened (5 prestiges complete). Visual language mirrors Me/Profile.

const humanNumber = require("human-number");
const { COLORS } = require("../Me/_shared");
const { FALLBACK_AVATAR } = require("./_shared");

const TOTAL_BLESSINGS = 7;
const GREEN_ACCENT = "#16A34A"; // Tailwind green-600 — used for ✓ marks and honeymoon +20% emphasis

const formatExp = n => humanNumber(n, v => Number.parseFloat(v).toFixed(1));

const BLESSING_ICONS = {
  language_gift: "🗣",
  swift_tongue: "⚡",
  ember_afterglow: "🔥",
  whispering: "💬",
  rhythm_spring: "💧",
  star_guard: "✦",
  greenhouse: "🌿",
};

const BLESSING_SHORT_DESC = {
  language_gift: "單句基礎 XP +8%",
  swift_tongue: "冷卻滿速 6s → 5s",
  ember_afterglow: "冷卻初段緩衝",
  whispering: "日 XP 滿速 0–600",
  rhythm_spring: "日 XP 30% 區 400–1200",
  star_guard: "群組加成 0.02 → 0.025",
  greenhouse: "群組 <10 人 ×1.3",
};

function blessingIcon(slug) {
  return BLESSING_ICONS[slug] || "·";
}

function blessingShort(slug, displayName) {
  return BLESSING_SHORT_DESC[slug] || displayName || "";
}

function formatTrialRestriction(restrictionMeta) {
  if (!restrictionMeta || typeof restrictionMeta !== "object") return null;
  switch (restrictionMeta.type) {
    case "xp_multiplier":
      return { label: "XP", value: `×${restrictionMeta.value}` };
    case "cooldown_shift_multiplier":
      return { label: "冷卻", value: `×${restrictionMeta.value}` };
    case "group_bonus_disabled":
      return { label: "群組", value: "加成失效" };
    case "none":
    default:
      return null;
  }
}

function buildAvatar(pictureUrl, borderColor = "#FFFFFF") {
  return {
    type: "box",
    layout: "vertical",
    width: "60px",
    height: "60px",
    cornerRadius: "100px",
    borderWidth: "2px",
    borderColor,
    flex: 0,
    contents: [
      {
        type: "image",
        url: pictureUrl || FALLBACK_AVATAR,
        aspectMode: "cover",
        aspectRatio: "1:1",
        size: "full",
      },
    ],
  };
}

function buildLevelPill({ text, bg = COLORS.amber400, fg = COLORS.textDark }) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: bg,
    cornerRadius: "xl",
    paddingStart: "sm",
    paddingEnd: "sm",
    paddingTop: "2px",
    paddingBottom: "2px",
    flex: 0,
    contents: [{ type: "text", text, weight: "bold", size: "xxs", color: fg, align: "center" }],
  };
}

function buildHoneymoonChip() {
  return {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        backgroundColor: COLORS.greenBg,
        cornerRadius: "md",
        paddingStart: "md",
        paddingEnd: "md",
        paddingTop: "sm",
        paddingBottom: "sm",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: "🌱 蜜月加成",
            size: "xs",
            color: COLORS.textMuted,
            flex: 1,
            gravity: "center",
          },
          {
            type: "text",
            contents: [
              { type: "span", text: "+20%", weight: "bold", color: GREEN_ACCENT, size: "md" },
              { type: "span", text: " XP", color: COLORS.textMuted, size: "xs" },
            ],
            align: "end",
            flex: 0,
          },
        ],
      },
      {
        type: "text",
        text: "首次轉生前限定 · 達 Lv.100 後選擇試煉、再轉生即可永久強化",
        size: "xxs",
        color: COLORS.textMuted,
        wrap: true,
        margin: "sm",
      },
    ],
  };
}

function buildAwakenedChip() {
  return {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        backgroundColor: COLORS.amberBg,
        cornerRadius: "md",
        paddingStart: "md",
        paddingEnd: "md",
        paddingTop: "sm",
        paddingBottom: "sm",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: "✨ 覺醒態",
            size: "xs",
            color: COLORS.textDark,
            weight: "bold",
            flex: 1,
            gravity: "center",
          },
          {
            type: "text",
            contents: [
              { type: "span", text: "永久", weight: "bold", color: COLORS.amber500, size: "sm" },
              { type: "span", text: " · 無試煉", color: COLORS.textMuted, size: "xs" },
            ],
            align: "end",
            flex: 0,
          },
        ],
      },
    ],
  };
}

function buildTrialActiveCard({
  activeTrial,
  progress,
  requiredExp,
  remainingDays,
  deadlineLabel,
}) {
  const restriction = formatTrialRestriction(activeTrial.restriction_meta);
  const progressPct =
    requiredExp > 0 ? Math.max(0, Math.min(100, Math.round((progress / requiredExp) * 100))) : 0;

  const headerRight = restriction
    ? {
        type: "text",
        contents: [
          { type: "span", text: restriction.label, color: COLORS.textMuted, size: "xxs" },
          {
            type: "span",
            text: ` ${restriction.value}`,
            weight: "bold",
            color: COLORS.amber500,
            size: "xs",
          },
        ],
        align: "end",
        flex: 0,
      }
    : null;

  return {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        backgroundColor: COLORS.amberBg,
        cornerRadius: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: "3px",
            backgroundColor: COLORS.amber400,
            contents: [],
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "md",
            flex: 1,
            contents: [
              {
                type: "box",
                layout: "horizontal",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: `⚔️ ★${activeTrial.star} ${activeTrial.display_name}`,
                    size: "sm",
                    weight: "bold",
                    color: COLORS.textDark,
                    flex: 1,
                  },
                  ...(headerRight ? [headerRight] : []),
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                margin: "sm",
                contents: [
                  { type: "text", text: "進度", size: "xxs", color: COLORS.textMuted, flex: 0 },
                  {
                    type: "text",
                    contents: [
                      {
                        type: "span",
                        text: progress.toLocaleString(),
                        weight: "bold",
                        color: COLORS.amber500,
                        size: "xs",
                      },
                      {
                        type: "span",
                        text: ` / ${requiredExp.toLocaleString()}`,
                        color: COLORS.textMuted,
                        size: "xxs",
                      },
                    ],
                    align: "end",
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                backgroundColor: "#FFFFFF",
                height: "5px",
                cornerRadius: "md",
                margin: "xs",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    height: "5px",
                    width: `${progressPct}%`,
                    backgroundColor: COLORS.amber400,
                    cornerRadius: "md",
                    contents: [],
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                margin: "sm",
                contents: [
                  { type: "text", text: "剩餘", size: "xxs", color: COLORS.textMuted, flex: 0 },
                  {
                    type: "text",
                    contents: [
                      {
                        type: "span",
                        text: String(remainingDays),
                        weight: "bold",
                        color: COLORS.amber500,
                        size: "sm",
                      },
                      {
                        type: "span",
                        text: deadlineLabel ? ` 天 · 至 ${deadlineLabel}` : " 天",
                        color: COLORS.textMuted,
                        size: "xxs",
                      },
                    ],
                    align: "end",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildTrialReadyCard({ readyTrial }) {
  return {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        backgroundColor: COLORS.amberBg,
        cornerRadius: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            width: "3px",
            backgroundColor: COLORS.amber500,
            contents: [],
          },
          {
            type: "box",
            layout: "vertical",
            paddingAll: "md",
            flex: 1,
            contents: [
              {
                type: "box",
                layout: "horizontal",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: `🪄 ★${readyTrial.star} ${readyTrial.display_name} 已通過`,
                    size: "sm",
                    weight: "bold",
                    color: COLORS.textDark,
                    flex: 1,
                  },
                  {
                    type: "text",
                    text: "✓",
                    size: "md",
                    weight: "bold",
                    color: GREEN_ACCENT,
                    flex: 0,
                  },
                ],
              },
              {
                type: "text",
                text: "消費這次通過記錄即可轉生 · 等級歸零，再選一個祝福永久強化",
                size: "xxs",
                color: COLORS.textMuted,
                wrap: true,
                margin: "xs",
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildBlessingGrid({ ownedSlugs, isReady }) {
  const ownedSet = new Set(ownedSlugs);
  const allSlugs = Object.keys(BLESSING_ICONS); // 7 slugs in fixed order
  const cells = allSlugs.map(slug => {
    if (ownedSet.has(slug)) {
      return {
        type: "box",
        layout: "vertical",
        height: "4px",
        backgroundColor: COLORS.amber400,
        cornerRadius: "md",
        flex: 1,
        contents: [],
      };
    }
    if (isReady && ownedSet.size + 1 <= TOTAL_BLESSINGS) {
      // mark the next slot when user can prestige (gain +1 next)
      // simplest: bordered slot for the first un-owned cell
      return null; // placeholder; we'll patch below
    }
    return {
      type: "box",
      layout: "vertical",
      height: "4px",
      backgroundColor: "#E5E7EB",
      cornerRadius: "md",
      flex: 1,
      contents: [],
    };
  });

  if (isReady) {
    const firstUnowned = allSlugs.findIndex(s => !ownedSet.has(s));
    if (firstUnowned !== -1) {
      cells[firstUnowned] = {
        type: "box",
        layout: "vertical",
        height: "4px",
        backgroundColor: "#E5E7EB",
        borderColor: COLORS.amber400,
        borderWidth: "1px",
        cornerRadius: "md",
        flex: 1,
        contents: [],
      };
    }
  }

  // Replace any leftover null with default empty cell
  return cells.map(
    cell =>
      cell || {
        type: "box",
        layout: "vertical",
        height: "4px",
        backgroundColor: "#E5E7EB",
        cornerRadius: "md",
        flex: 1,
        contents: [],
      }
  );
}

function buildBlessingsSection({ ownedBlessings, isReady, isAwakened }) {
  const ownedSlugs = ownedBlessings.map(b => b.slug);
  const ownedCount = ownedBlessings.length;

  let counterText;
  if (isAwakened) {
    counterText = {
      type: "text",
      contents: [
        {
          type: "span",
          text: `✓ ${ownedCount}`,
          weight: "bold",
          color: GREEN_ACCENT,
          size: "sm",
        },
        {
          type: "span",
          text: ` / ${TOTAL_BLESSINGS}  ·  全收集`,
          color: COLORS.amber500,
          size: "xs",
          weight: "bold",
        },
      ],
      align: "end",
      flex: 0,
    };
  } else if (ownedCount === 0) {
    counterText = {
      type: "text",
      contents: [
        { type: "span", text: "0", weight: "bold", color: COLORS.textMuted, size: "sm" },
        { type: "span", text: ` / ${TOTAL_BLESSINGS}`, color: COLORS.textMuted, size: "xs" },
      ],
      align: "end",
      flex: 0,
    };
  } else {
    const tail = isReady ? `  ·  下一個 +1` : "";
    counterText = {
      type: "text",
      contents: [
        {
          type: "span",
          text: String(ownedCount),
          weight: "bold",
          color: COLORS.amber500,
          size: "sm",
        },
        {
          type: "span",
          text: ` / ${TOTAL_BLESSINGS}${tail}`,
          color: COLORS.textMuted,
          size: "xs",
        },
      ],
      align: "end",
      flex: 0,
    };
  }

  const grid = {
    type: "box",
    layout: "horizontal",
    spacing: "xs",
    margin: "sm",
    contents: buildBlessingGrid({ ownedSlugs, isReady }),
  };

  let listOrEmpty;
  if (ownedCount === 0) {
    listOrEmpty = {
      type: "text",
      text: "○ 尚未獲得任何祝福",
      size: "xxs",
      color: COLORS.textMuted,
      margin: "sm",
      align: "center",
    };
  } else if (isAwakened) {
    // grouped 3 + 3 + 1 layout
    const rows = [];
    for (let i = 0; i < ownedBlessings.length; i += 3) {
      const group = ownedBlessings.slice(i, i + 3);
      const isLastSingleRow = group.length === 1 && i === ownedBlessings.length - 1;
      const groupText = group.map(b => `${blessingIcon(b.slug)} ${b.display_name}`).join("  ");
      const row = {
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "✓",
            size: "xs",
            color: GREEN_ACCENT,
            weight: "bold",
            flex: 0,
          },
          {
            type: "text",
            text: groupText,
            size: "xxs",
            color: COLORS.textDark,
            weight: "bold",
            flex: isLastSingleRow ? 0 : 1,
            ...(isLastSingleRow ? {} : { wrap: true }),
          },
        ],
      };
      if (isLastSingleRow) {
        row.contents.push({
          type: "text",
          text: "全部祝福已永久生效",
          size: "xxs",
          color: COLORS.textMuted,
          flex: 1,
          align: "end",
        });
      }
      rows.push(row);
    }
    listOrEmpty = {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "sm",
      contents: rows,
    };
  } else {
    listOrEmpty = {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "sm",
      contents: ownedBlessings.map(b => ({
        type: "box",
        layout: "baseline",
        spacing: "sm",
        contents: [
          { type: "text", text: "✓", size: "xs", color: GREEN_ACCENT, weight: "bold", flex: 0 },
          {
            type: "text",
            text: `${blessingIcon(b.slug)} ${b.display_name}`,
            size: "xs",
            color: COLORS.textDark,
            weight: "bold",
            flex: 0,
          },
          {
            type: "text",
            text: blessingShort(b.slug, b.display_name),
            size: "xxs",
            color: COLORS.textMuted,
            flex: 1,
          },
        ],
      })),
    };
  }

  return {
    type: "box",
    layout: "vertical",
    paddingStart: "lg",
    paddingEnd: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        contents: [
          {
            type: "text",
            text: "祝福收集",
            size: "xxs",
            color: COLORS.textMuted,
            flex: 1,
            gravity: "center",
          },
          counterText,
        ],
      },
      grid,
      listOrEmpty,
    ],
  };
}

function buildFooter({ scenario, liffUri, liffUriSummary }) {
  if (scenario === "honeymoon" || scenario === "between") {
    return {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      paddingTop: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#E5E7EB",
          cornerRadius: "md",
          paddingTop: "md",
          paddingBottom: "md",
          contents: [
            {
              type: "text",
              text: "達 Lv.100 解鎖試煉",
              size: "sm",
              color: COLORS.textMuted,
              weight: "bold",
              align: "center",
            },
          ],
        },
      ],
    };
  }

  if (scenario === "ready") {
    return {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      paddingTop: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.amber400,
          cornerRadius: "md",
          paddingTop: "md",
          paddingBottom: "md",
          action: { type: "uri", label: "立即轉生", uri: liffUri },
          contents: [
            {
              type: "text",
              text: "🪄 立即轉生",
              size: "sm",
              color: COLORS.textDark,
              weight: "bold",
              align: "center",
            },
          ],
        },
      ],
    };
  }

  if (scenario === "awakened") {
    return {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      paddingTop: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: COLORS.cyanBg,
          cornerRadius: "md",
          paddingTop: "md",
          paddingBottom: "md",
          action: { type: "uri", label: "了解祝福組合", uri: liffUriSummary || liffUri },
          contents: [
            {
              type: "text",
              text: "了解祝福組合",
              size: "sm",
              color: COLORS.cyan700,
              weight: "bold",
              align: "center",
            },
          ],
        },
      ],
    };
  }

  // active trial
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    paddingTop: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        backgroundColor: COLORS.cyanBg,
        cornerRadius: "md",
        paddingTop: "md",
        paddingBottom: "md",
        action: { type: "uri", label: "了解試煉詳情", uri: liffUri },
        contents: [
          {
            type: "text",
            text: "了解試煉詳情",
            size: "sm",
            color: COLORS.cyan700,
            weight: "bold",
            align: "center",
          },
        ],
      },
    ],
  };
}

function resolveScenario({ awakened, readyTrial, activeTrial, prestigeCount }) {
  if (awakened) return "awakened";
  if (readyTrial) return "ready";
  if (activeTrial) return "active";
  if ((prestigeCount || 0) === 0) return "honeymoon";
  return "between"; // prestige 1+ but no active trial yet
}

function buildFlag({ scenario, prestigeCount, activeTrial, readyTrial }) {
  if (scenario === "awakened") {
    return "★★★★★ 轉生 5 次 · 試煉旅程已完成";
  }
  if (scenario === "ready" && readyTrial) {
    const stars = "★".repeat(Math.max(0, prestigeCount || 0));
    return `🪄 試煉通過 · 可立即轉生${stars ? `  ·  ${stars} 轉生 ${prestigeCount} 次` : ""}`;
  }
  if (scenario === "active" && activeTrial) {
    const stars = "★".repeat(Math.max(0, prestigeCount || 0));
    return `⚔️ ★${activeTrial.star} 試煉中${stars ? `  ·  ${stars} 轉生 ${prestigeCount} 次` : ""}`;
  }
  if (scenario === "honeymoon") {
    return "🌱 蜜月期";
  }
  // between
  const stars = "★".repeat(Math.max(0, prestigeCount || 0));
  return stars ? `${stars} 轉生 ${prestigeCount} 次` : null;
}

/**
 * @param {Object} input
 * @param {String} input.displayName
 * @param {String} input.pictureUrl
 * @param {Number} input.prestigeCount        0..5
 * @param {Boolean} input.awakened            prestigeCount >= 5
 * @param {Number} input.level                current_level 0..100
 * @param {Number} input.expCurrent           XP within current level
 * @param {Number} input.expNext              XP needed for next level (0 at MAX)
 * @param {Number} input.expRate              0..100
 * @param {Object|null} input.activeTrial     { id, star, display_name, required_exp, restriction_meta }
 * @param {Number} input.activeTrialProgress  effective progress 0..required_exp
 * @param {Number|null} input.activeTrialRemainingDays
 * @param {String|null} input.activeTrialDeadlineLabel  e.g. "06/11"
 * @param {Object|null} input.readyTrial      { star, display_name } - passed but not consumed
 * @param {Array} input.ownedBlessings        [{slug, display_name}]
 * @param {String} input.liffUri              LIFF base /prestige
 * @param {String} input.liffUriSummary       LIFF /prestige?view=summary (awakened)
 * @returns {{altText: String, contents: Object}}
 */
function build(input) {
  const scenario = resolveScenario({
    awakened: input.awakened,
    readyTrial: input.readyTrial,
    activeTrial: input.activeTrial,
    prestigeCount: input.prestigeCount,
  });

  const flagText = buildFlag({
    scenario,
    prestigeCount: input.prestigeCount,
    activeTrial: input.activeTrial,
    readyTrial: input.readyTrial,
  });

  const isReady = scenario === "ready";
  const isAwakened = scenario === "awakened";

  const heroLevelDisplay = (() => {
    if (isAwakened) return "✨ 覺醒者";
    if (isReady) return "Lv.100 MAX";
    return `Lv.${input.level || 0}`;
  })();

  const hero = buildHeroExplicit({
    displayName: input.displayName,
    pictureUrl: input.pictureUrl,
    flagText,
    expCurrent: input.expCurrent,
    expNext: input.expNext,
    expRate: input.expRate,
    levelText: heroLevelDisplay,
    isReady,
    isAwakened,
  });

  const sections = [hero];

  if (scenario === "honeymoon") {
    sections.push(buildHoneymoonChip());
  } else if (scenario === "active") {
    sections.push(
      buildTrialActiveCard({
        activeTrial: input.activeTrial,
        progress: input.activeTrialProgress || 0,
        requiredExp: input.activeTrial.required_exp || 0,
        remainingDays: input.activeTrialRemainingDays ?? 0,
        deadlineLabel: input.activeTrialDeadlineLabel,
      })
    );
  } else if (scenario === "ready") {
    sections.push(buildTrialReadyCard({ readyTrial: input.readyTrial }));
  } else if (scenario === "awakened") {
    sections.push(buildAwakenedChip());
  }

  sections.push(
    buildBlessingsSection({
      ownedBlessings: input.ownedBlessings || [],
      isReady,
      isAwakened,
    })
  );

  sections.push(
    buildFooter({
      scenario,
      liffUri: input.liffUri,
      liffUriSummary: input.liffUriSummary,
    })
  );

  return {
    altText: `${input.displayName || "玩家"} 的轉生狀態`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "none",
        paddingAll: "none",
        contents: sections,
      },
    },
  };
}

// Hero builder takes pre-resolved level text so it doesn't need to recompute
function buildHeroExplicit({
  displayName,
  pictureUrl,
  flagText,
  expCurrent,
  expNext,
  expRate,
  levelText,
  isReady,
  isAwakened,
}) {
  const avatarBorder = isReady || isAwakened ? COLORS.amber400 : "#FFFFFF";

  let levelPillBg = COLORS.amber400;
  let levelPillFg = COLORS.textDark;
  if (isAwakened) {
    levelPillBg = COLORS.textDark;
    levelPillFg = COLORS.amber400;
  }

  const isMax = !expNext && expCurrent > 0;
  const expText = isReady
    ? `MAX · ${formatExp(expCurrent)} / ${formatExp(expCurrent || expNext || 0)}`
    : isMax
      ? "MAX"
      : `${formatExp(expCurrent)} / ${formatExp(expNext)}`;
  const clampedRate = isReady ? 100 : Math.max(0, Math.min(100, expRate || 0));

  const heroBg = isAwakened
    ? {
        type: "linearGradient",
        angle: "135deg",
        startColor: COLORS.cyan700,
        centerColor: COLORS.cyan600,
        centerPosition: "55%",
        endColor: COLORS.amber500,
      }
    : {
        type: "linearGradient",
        angle: "135deg",
        startColor: COLORS.cyan700,
        endColor: COLORS.cyan600,
      };

  const flagRow = flagText
    ? {
        type: "text",
        text: flagText,
        size: "xxs",
        color: COLORS.amber300,
        weight: "bold",
        margin: "xs",
        wrap: true,
      }
    : null;

  return {
    type: "box",
    layout: "vertical",
    paddingAll: "lg",
    background: heroBg,
    backgroundColor: COLORS.cyan700,
    contents: [
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        alignItems: "center",
        contents: [
          buildAvatar(pictureUrl, avatarBorder),
          {
            type: "box",
            layout: "vertical",
            flex: 1,
            contents: [
              {
                type: "box",
                layout: "horizontal",
                spacing: "sm",
                alignItems: "center",
                contents: [
                  {
                    type: "text",
                    text: displayName || "玩家",
                    weight: "bold",
                    size: "md",
                    color: "#FFFFFF",
                    flex: 1,
                    gravity: "center",
                  },
                  buildLevelPill({ text: levelText, bg: levelPillBg, fg: levelPillFg }),
                ],
              },
              ...(flagRow ? [flagRow] : []),
            ],
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        margin: "md",
        contents: [
          { type: "text", text: "EXP", size: "xxs", color: "#FFFFFF", flex: 0 },
          {
            type: "text",
            text: expText,
            size: "xxs",
            color: COLORS.amber300,
            weight: "bold",
            align: "end",
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        backgroundColor: COLORS.whiteOverlay,
        height: "7px",
        cornerRadius: "md",
        margin: "xs",
        contents: [
          {
            type: "box",
            layout: "vertical",
            height: "7px",
            width: `${clampedRate}%`,
            backgroundColor: COLORS.amber400,
            cornerRadius: "md",
            contents: [],
          },
        ],
      },
    ],
  };
}

exports.build = build;
exports._internal = { resolveScenario, buildFlag, formatTrialRestriction };
