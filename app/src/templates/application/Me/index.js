const Profile = require("./Profile");
const Progress = require("./Progress");
const Subscription = require("./Subscription");

/**
 * Assemble /me bubbles.
 * 0 or 1 subscription card → 2 bubbles (Profile, Progress), subscription inlined in Profile.
 * 2+ subscription cards → 3 bubbles (Profile with badge, Subscription, Progress).
 *
 * @param {Object} data
 * @param {String} data.displayName
 * @param {String} data.pictureUrl
 * @param {Number} data.level
 * @param {Number} data.expRate          % to next level (0–100)
 * @param {Number} data.expCurrent
 * @param {Number} data.expNext
 * @param {Array<String>} [data.flags]   prestige status flags ("✨ 覺醒者", "⚔️ ★N 試煉中", etc.)
 * @param {Object} data.today            today's quest flags
 * @param {Boolean} data.today.gacha
 * @param {Boolean} data.today.janken
 * @param {Number}  data.today.weeklyCompleted
 * @param {Number} data.signinDays
 * @param {Number} data.characterCurrent
 * @param {Number} data.characterTotal
 * @param {Number} data.starProgress     0–100
 * @param {Number} data.godStone
 * @param {Number} data.paidStone
 * @param {Number|String|null} data.lastRainbowDays
 * @param {Number|String|null} data.lastHasNewDays
 * @param {Object} data.janken           {win, lose, draw, rate}
 * @param {Array}  data.subscriptionCards [{key, titleText, expireText, effects: string[]}]
 * @returns {Array} bubbles
 */
exports.buildBubbles = data => {
  const cards = data.subscriptionCards || [];
  const bubbles = [];

  if (cards.length <= 1) {
    bubbles.push(
      Profile.build({
        displayName: data.displayName,
        pictureUrl: data.pictureUrl,
        level: data.level,
        expRate: data.expRate,
        expCurrent: data.expCurrent,
        expNext: data.expNext,
        flags: data.flags,
        today: data.today,
        signinDays: data.signinDays,
        subscriptionPanel: cards.length === 1 ? cards[0] : null,
        subscriptionBadge: null,
        dailyRaw: data.dailyRaw,
        tier1Upper: data.tier1Upper,
        tier2Upper: data.tier2Upper,
        xpHistoryUri: data.xpHistoryUri,
      })
    );
  } else {
    bubbles.push(
      Profile.build({
        displayName: data.displayName,
        pictureUrl: data.pictureUrl,
        level: data.level,
        expRate: data.expRate,
        expCurrent: data.expCurrent,
        expNext: data.expNext,
        flags: data.flags,
        today: data.today,
        signinDays: data.signinDays,
        subscriptionPanel: null,
        subscriptionBadge: { text: cards.map(c => c.titleText).join(" + ") },
        dailyRaw: data.dailyRaw,
        tier1Upper: data.tier1Upper,
        tier2Upper: data.tier2Upper,
        xpHistoryUri: data.xpHistoryUri,
      })
    );
    bubbles.push(Subscription.build({ panels: cards }));
  }

  bubbles.push(
    Progress.build({
      characterCurrent: data.characterCurrent,
      characterTotal: data.characterTotal,
      starProgress: data.starProgress,
      godStone: data.godStone,
      paidStone: data.paidStone,
      lastRainbowDays: data.lastRainbowDays,
      lastHasNewDays: data.lastHasNewDays,
      janken: data.janken,
    })
  );

  return bubbles;
};
