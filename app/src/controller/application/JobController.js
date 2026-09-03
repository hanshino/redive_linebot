const { text } = require("bottender/router");
const i18n = require("../../util/i18n");
const moment = require("moment");
const JobTemplate = require("../../templates/application/Job");
const RPGCharacter = require("../../model/application/RPGCharacter");
const { Adventurer, Swordman, Mage } = RPGCharacter;
const minigameService = require("../../service/MinigameService");
const WorldBossRoundEffect = require("../../model/application/WorldBossRoundEffect");
const config = require("config");
const mageTeacher = {
  name: "法師教官",
  iconUrl: "https://pcredivewiki.tw/static/images/unit/icon_unit_126531.png",
};
const swordmanTeacher = {
  name: "劍士教官",
  iconUrl: "https://pcredivewiki.tw/static/images/unit/icon_unit_104731.png",
};
const thiefTeacher = {
  name: "盜賊教官",
  iconUrl: "https://pcredivewiki.tw/static/images/unit/icon_unit_104661.png",
};

exports.router = [text(/^[.#/](轉職)$/, showChangeJob), text(/^[.#/](我的職業)$/, showMyJob)];

exports.showMyJob = showMyJob;

/**
 * Start swordman job mission.
 *
 * @param {import ("bottender").LineContext} context - The context object.
 */
exports.startSwordmanJobMission = async function (context) {
  const { changeJobMission } = context.state;
  const now = moment();
  const canAccept = await isUserCanAcceptMission(context);

  if (!canAccept) {
    return;
  }

  if (changeJobMission && now.isBefore(changeJobMission.endTime)) {
    return await context.replyText(
      i18n.__("message.rpg.swordman_job_mission_already_started", {
        time: moment(changeJobMission.endTime).diff(now, "seconds"),
      })
    );
  }

  const state = {
    job: Swordman.key,
    count: 0,
    startTime: now.format("YYYY-MM-DD HH:mm:ss"),
    endTime: now.add(10, "minutes").format("YYYY-MM-DD HH:mm:ss"),
    limit: 10,
  };
  context.setState({ changeJobMission: state });
  context.replyText(i18n.__("message.rpg.swordman_start_job_mission"), {
    sender: { name: "系統提示" },
  });
  return await context.replyFlex("劍士轉職考驗", JobTemplate.swordmanMission);
};

exports.startMageChangeJobMission = async function (context) {
  const { changeJobMission } = context.state;
  const now = moment();
  const canAccept = await isUserCanAcceptMission(context);

  if (!canAccept) {
    return;
  }

  if (changeJobMission && now.isBefore(changeJobMission.endTime)) {
    return await context.replyText(
      i18n.__("message.rpg.mage_job_mission_already_started", {
        time: moment(changeJobMission.endTime).diff(now, "seconds"),
      })
    );
  }

  const state = {
    job: Mage.key,
    count: 0,
    startTime: now.format("YYYY-MM-DD HH:mm:ss"),
    endTime: now.add(10, "minutes").format("YYYY-MM-DD HH:mm:ss"),
    limit: 3,
  };
  context.setState({ changeJobMission: state });
  context.replyText(i18n.__("message.rpg.mage_start_job_mission"), {
    sender: { name: "系統提示" },
  });
  context.replyText(i18n.__("message.rpg.mage_start_job_mission_help"), {
    sender: mageTeacher,
  });

  return await context.replyFlex("法師轉職考驗", JobTemplate.mageMission);
};

exports.startThiefChangeJobMission = async function (context) {
  const { changeJobMission } = context.state;
  const now = moment();
  const canAccept = await isUserCanAcceptMission(context);

  if (!canAccept) {
    return;
  }

  if (changeJobMission && now.isBefore(changeJobMission.endTime)) {
    return await context.replyText(
      i18n.__("message.rpg.thief_job_mission_already_started", {
        time: moment(changeJobMission.endTime).diff(now, "seconds"),
      })
    );
  }

  const state = {
    job: "thief",
    count: 0,
    startTime: now.format("YYYY-MM-DD HH:mm:ss"),
    endTime: now.add(10, "minutes").format("YYYY-MM-DD HH:mm:ss"),
    limit: 3,
  };
  context.setState({ changeJobMission: state });
  context.replyText(i18n.__("message.rpg.thief_start_job_mission"), {
    sender: { name: "系統提示" },
  });
  context.replyFlex("盜賊轉職考驗", JobTemplate.thiefMission);
  return await context.replyText(i18n.__("message.rpg.thief_start_job_mission_help"), {
    sender: thiefTeacher,
  });
};

/**
 * Show change job flex message.
 *
 * @param {import ("bottender").LineContext} context - The context object.
 */
async function showChangeJob(context) {
  const { quoteToken } = context.event.message;
  const flexMessage = JobTemplate.changeJob;
  const canAccept = await isUserCanAcceptMission(context);

  if (!canAccept) {
    return;
  }

  context.replyText(i18n.__("message.rpg.change_job"), { quoteToken });
  return context.replyFlex("轉職選單", flexMessage);
}

/**
 * Swordman attack target.
 * @param {import ("bottender").LineContext} context - The context object.
 */
exports.swordmanAttackTarget = async function (context) {
  const { changeJobMission } = context.state;
  const {
    userId,
    displayName = "-",
    pictureUrl = config.get("defaultUserIcon"),
  } = context.event.source;
  const now = moment();

  if (!changeJobMission) {
    // 任務有效檢查
    return;
  }

  if (now.isAfter(changeJobMission.endTime)) {
    // 任務期限檢查
    return;
  }

  // TODO: 檢查是否為冒險者

  const { count = 0 } = changeJobMission;

  if (count >= changeJobMission.limit) {
    // 任務次數檢查
    return;
  }

  const scripts = [
    "怎麼了，菜鳥，你的程度就這樣嗎？",
    "劍就是你的夥伴，試著回想起得到它的初衷。",
    "不錯，繼續保持。每一次的劍動都是你技藝進步的一步。",
    "別只顧著揮劍，注意身法和步法。這是戰場上生存的要點。",
    "有點樣子了，再多感受一下。你的劍是你在這世界上最堅強的伙伴。",
    "感覺到了嗎，那股力量。每一次的揮動都蘊含著力量和意志。",
    "沒錯，準備蓄力給予最後一擊吧。需要更多的力量和專注。",
    "還沒有，再繼續。力量來自於持之以恆的努力，不要輕言放棄。",
    "就快了，找出它的弱點。在戰鬥中，觀察敵人，找到攻擊的最佳時機。",
    "就是現在，放心交給身體吧，使出那招！",
  ];

  const { level } = await minigameService.findByUserId(userId);

  let damage;
  if (count < 5) {
    damage = new Adventurer({ level }).attack();
  } else {
    damage = new Swordman({ level }).attack();
  }

  const script = scripts[count] || "錯誤：請回報管理員";

  if (count === changeJobMission.limit - 1) {
    context.replyText(script, {
      sender: swordmanTeacher,
    });
    context.replyText("震地斬擊！", { sender: { name: displayName, iconUrl: pictureUrl } });
    context.replyText("你成功的通過了劍士轉職考驗！", { sender: { name: "系統提示" } });
    damage *= 10;

    // 清除任務狀態
    context.setState({ changeJobMission: null });

    // 更新職業
    await minigameService.changeUserJob(userId, Swordman.key);
  }

  context.replyText(`造成了 ${damage} 點傷害！(${count + 1} / 10)`, {
    sender: { name: displayName, iconUrl: pictureUrl },
  });
  count !== changeJobMission.limit - 1 &&
    context.replyText(script, {
      sender: swordmanTeacher,
    });

  const state = {
    ...changeJobMission,
    count: count + 1,
  };
  context.setState({ changeJobMission: state });
};

exports.mageUseElement = async function (context, { payload }) {
  const { changeJobMission } = context.state;
  const { element } = payload;
  const {
    userId,
    displayName = "-",
    pictureUrl = config.get("defaultUserIcon"),
  } = context.event.source;
  const now = moment();

  if (!changeJobMission) {
    // 任務有效檢查
    return;
  }

  if (now.isAfter(changeJobMission.endTime)) {
    // 任務期限檢查
    return;
  }

  const npcScripts = [
    "很好～趕緊接著詠唱土元素",
    "沒錯！再來是水元素",
    "最後以風元素收尾，完成此次的魔法",
    "很好，你已經掌握了魔法的基本詠唱方式，日後要好好運用元素的特性",
  ];
  const userScripts = [
    "烈火之力，燃盡一切。火焰之歌，在我手中吟唱。",
    "大地之靈，凝結於我。堅如磐石，力不可擋。",
    "激流之力，潮汐之音。水氣翻湧，舞動生命之歌。",
    "狂風呼嘯，自由之舞。風之力，助我展翅高飛。",
  ];

  const { count = 0 } = changeJobMission;

  const isFire = element === "fire";
  const isWater = element === "water";
  const isWind = element === "wind";
  const isEarth = element === "earth";
  const next = () => {
    const state = {
      ...changeJobMission,
      count: count + 1,
    };
    context.setState({ changeJobMission: state });
    context.replyText(userScripts[count], {
      sender: { name: displayName, iconUrl: pictureUrl },
    });
    context.replyText(npcScripts[count], {
      sender: mageTeacher,
    });
  };

  if (count === 0 && isFire) {
    next();
  } else if (count === 1 && isEarth) {
    next();
  } else if (count === 2 && isWater) {
    next();
  } else if (count === 3 && isWind) {
    context.replyText(npcScripts[count], {
      sender: mageTeacher,
    });
    context.replyText("你成功的通過了法師轉職考驗！", { sender: { name: "系統提示" } });

    // 清除任務狀態
    context.setState({ changeJobMission: null });

    // 更新職業
    await minigameService.changeUserJob(userId, Mage.key);
  }
};

exports.thiefSteal = async function (context, { payload }) {
  const { changeJobMission } = context.state;
  const { id } = payload;
  const { userId } = context.event.source;
  const now = moment();

  if (!changeJobMission) {
    // 任務有效檢查
    return;
  }

  if (now.isAfter(changeJobMission.endTime)) {
    // 任務期限檢查
    return;
  }

  const npcScripts = [
    "不錯嘛，找到第一個目標了，繼續找下一個",
    "很好，再找一個目標",
    "幹得不錯，好好活用這個技巧，這就是致命一擊的精隨，日後要好好活用",
  ];

  const { package = [] } = changeJobMission;
  if (package.includes(id)) {
    return;
  }

  const state = {
    ...changeJobMission,
    package: [...package, id],
  };
  context.setState({ changeJobMission: state });

  const count = package.length;

  if (count !== 2) {
    context.replyText(npcScripts[count], {
      sender: thiefTeacher,
    });
  } else {
    context.replyText(npcScripts[count], {
      sender: thiefTeacher,
    });
    context.replyText("你成功的通過了盜賊轉職考驗！", { sender: { name: "系統提示" } });

    // 清除任務狀態
    context.setState({ changeJobMission: null });

    // 更新職業
    await minigameService.changeUserJob(userId, "thief");
  }
};

/**
 * `#我的職業` — answers "what job am I" and "why do damage numbers differ", the two
 * most common player questions. Public-facing but personal-scoped (only the caller's
 * own job/level/skill), so it is safe to reply directly rather than to a group board.
 *
 * Deliberately excludes quota, EXP, season score and ranking — those are personal
 * progress and belong in LIFF, not a chat reply (see CLAUDE.md group message rules).
 *
 * @param {import ("bottender").LineContext} context - The context object.
 */
async function showMyJob(context) {
  const { userId } = context.event.source;
  const progress = await minigameService.findByUserId(userId);
  const level = progress?.level || 1;
  const jobKey = progress?.job_key || Adventurer.key;
  // MinigameLevel.findByUserId already joins minigame_job and returns job_name, so
  // reading it here (rather than a second RPGCharacter.getJobName() query against the
  // same table) avoids a redundant round trip for data already in hand.
  const jobName = progress?.job_name || "冒險者";

  const character = RPGCharacter.make(jobKey, { level });
  const skill = character.skillOne;

  // 效果種類讀自 WorldBossRoundEffect.planFor：swordman / thief 沒有對應的
  // EFFECT_BY_JOB 項目，回傳 null 就是「不留效果」，不是憑經驗值判斷。
  const plan = WorldBossRoundEffect.planFor(jobKey, String(character.getStandardDamage()));
  const effectLine = !plan
    ? "攻擊後不會留下任何效果。"
    : plan.effect_type === WorldBossRoundEffect.TYPES.BANNER
      ? "攻擊後會留下「鼓舞」效果：其他玩家接力消耗後，你和對方都能額外拿到分數，但不會增加傷害。"
      : "攻擊後會留下「魔力刻印」效果：其他玩家接力消耗後可以疊加傷害，你也會額外拿到分數。";

  const lines = [
    `職業：${jobName}（等級 ${level}）`,
    `技能：${skill.name}，消耗 ${skill.cost} 點，造成 ${skill.rate} 倍傷害`,
    effectLine,
    "",
    "攻擊數值為什麼有高有低：",
    "・等級是主要因素，基礎傷害 = 等級的平方 + 等級 × 10",
    "・再乘上各職業的技能倍率",
    "・同一個人每次攻擊會有 ±10% 的熟練度浮動",
    ...(skill.criticalRate ? [`・有 ${skill.criticalRate}% 機率觸發暴擊，造成更高倍率傷害`] : []),
  ];

  context.replyText(lines.join("\n"));
}

/**
 * Check user is can accept mission.
 * @param {import ("bottender").LineContext} context - The context object.
 * @returns {Promise<boolean>} - True if user can accept mission.
 */
async function isUserCanAcceptMission(context) {
  const { userId } = context.event.source;
  const { changeJobMission } = context.state;

  const { job_class_advancement: classAdv, level = 0 } = await minigameService.findByUserId(userId);
  if (classAdv !== 0) {
    context.replyText(i18n.__("message.rpg.change_job_already"));
    return false;
  }

  if (level < 30) {
    context.replyText(i18n.__("message.rpg.change_job_level_limit"));
    return false;
  }

  const now = moment();
  if (changeJobMission && now.isBefore(changeJobMission.endTime)) {
    return false;
  }

  return true;
}
