/**
 * @class MinigameJob
 * @extends base
 */

/**
 * @class Adventurer
 * @property {string} key - The key of the adventurer.
 * @property {number} level - The level of the adventurer.
 * @property {number} power - The power of the adventurer.
 * @method {Promise} getJobName - Returns the job name of the adventurer.
 * @method {number} attack - Returns the damage of the adventurer's attack.
 * @method {number} getStandardDamage - Returns the standard damage of the adventurer.
 * @method {number} getSkillOneDamage - Returns the damage of the adventurer's skill one.
 * @property {object} skillOneInfo - Information about the adventurer's skill one.
 * @property {string} skillOneInfo.name - The name of the skill one.
 * @property {string} skillOneInfo.description - The description of the skill one.
 * @property {number} skillOneInfo.cost - The cost of the skill one.
 * @method {boolean} isCritical - Checks if the adventurer's attack is critical.
 */

/**
 * @class Swordman
 * @extends Adventurer
 * @property {string} key - The key of the swordman.
 * @property {number} level - The level of the swordman.
 * @property {number} power - The power of the swordman.
 * @property {object} skillOne - Information about the swordman's skill one.
 * @property {string} skillOne.name - The name of the skill one.
 * @property {string} skillOne.description - The description of the skill one.
 * @property {number} skillOne.cost - The cost of the skill one.
 * @property {number} skillOne.rate - The rate of the skill one.
 * @method {number} getSkillOneDamage - Returns the damage of the swordman's skill one.
 */

/**
 * @class Mage
 * @extends Adventurer
 * @property {string} key - The key of the mage.
 * @property {number} level - The level of the mage.
 * @property {number} power - The power of the mage.
 * @property {object} skillOne - Information about the mage's skill one.
 * @property {string} skillOne.name - The name of the skill one.
 * @property {string} skillOne.description - The description of the skill one.
 * @property {number} skillOne.cost - The cost of the skill one.
 * @property {number} skillOne.rate - The rate of the skill one.
 * @property {number} skillOne.criticalRate - The critical rate of the skill one.
 * @property {number} skillOne.creticalBonus - The critical bonus of the skill one.
 * @method {number} getSkillOneDamage - Returns the damage of the mage's skill one.
 */

/**
 * @class Thief
 * @extends Adventurer
 * @property {string} key - The key of the thief.
 * @property {number} level - The level of the thief.
 * @property {number} power - The power of the thief.
 * @property {object} skillOne - Information about the thief's skill one.
 * @property {string} skillOne.name - The name of the skill one.
 * @property {string} skillOne.description - The description of the skill one.
 * @property {number} skillOne.cost - The cost of the skill one.
 * @property {number} skillOne.rate - The rate of the skill one.
 * @property {number} skillOne.criticalRate - The critical rate of the skill one.
 * @property {number} skillOne.creticalBonus - The critical bonus of the skill one.
 * @method {number} getSkillOneDamage - Returns the damage of the thief's skill one.
 */

/**
 * @function make
 * @param {string} jobKey - The key of the adventurer.
 * @param {object} options - The options for creating an adventurer.
 * @param {number} options.level - The level of the adventurer.
 * @returns {Adventurer} - The created adventurer.
 */

const base = require("../base");
const _ = require("lodash");

class MinigameJob extends base {}

const minigameJob = new MinigameJob({ table: "minigame_job" });

const enumSkills = {
  STANDARD: "standard",
  SKILL_ONE: "skillOne",
};

/**
 * @typedef {Object} CriticalConfig
 * @property {number} min - The minimum value of the critical config.
 * @property {number} max - The maximum value of the critical config.
 * @property {number} rate - The rate of the critical config.
 */

/**
 * make critical config
 * @param {Number} min
 * @param {Number} max
 * @param {Number} rate
 * @returns {CriticalConfig}
 */
const makeCriticalConfig = (min, max, rate) => {
  return {
    min,
    max,
    rate,
  };
};

exports.enumSkills = enumSkills;

class Adventurer {
  static get key() {
    return "adventurer";
  }

  static get allowSkills() {
    return [enumSkills.STANDARD, enumSkills.SKILL_ONE];
  }

  constructor({ level }) {
    this.level = level;
    this.key = "adventurer";
    this.power = 1;
    /**
     * 熟練度：皆預設在 90%，此數值會影響基礎傷害在 90%~110% 之間浮動
     */
    this.proficiency = 90;
  }

  async getJobName() {
    return await minigameJob.first({ filter: { key: this.key } });
  }

  attack() {
    return this.getStandardDamage();
  }

  getStandardDamage() {
    return Math.floor(Math.pow(this.level, 2)) + this.level * 10;
  }

  getNormalDamage() {
    // 熟練度補正
    const proficiencyRate = _.random(90, 110, true) / 100;
    return Math.floor(this.getStandardDamage() * proficiencyRate);
  }

  getSkillOneDamage() {
    return this.getStandardDamage();
  }

  get skillOne() {
    return {
      name: "普通攻擊",
      description: "冒險者的普通攻擊",
      cost: 10,
    };
  }

  isCritical(rate = 10) {
    return _.random(0, 100, true) < rate;
  }

  /**
   * 計算暴擊加成
   * @param {CriticalConfig[]} configList
   * @returns {number}
   */
  calculateCriticalBonus(configList) {
    const rateList = _.flattenDeep(configList.map((c, i) => Array(c.rate).fill(i)));
    const rateIdx = _.sample(rateList);
    const config = configList[rateIdx];

    return _.random(config.min, config.max, true);
  }
}

class Swordman extends Adventurer {
  static get key() {
    return "swordman";
  }

  constructor({ level }) {
    super({ level });
    this.key = "swordman";
    this.power = 1;
  }

  get skillOne() {
    return {
      name: "震地斬擊",
      description: "穩定的重擊，造成 2.2 倍傷害",
      cost: 10,
      rate: 2.2,
      criticalRate: 8,
      criticalConfig: [makeCriticalConfig(1.2, 1.4, 100)],
    };
  }

  getSkillOneDamage() {
    return Math.floor(this.getNormalDamage() * this.skillOne.rate);
  }
}

class Mage extends Adventurer {
  static get key() {
    return "mage";
  }

  constructor({ level }) {
    super({ level });
    this.key = "mage";
    this.power = 1;
  }

  get skillOne() {
    return {
      name: "元素之力",
      description: "低消耗的魔法攻擊，容易產生爆擊",
      cost: 7,
      rate: 1.0,
      criticalRate: 25,
      criticalConfig: [
        makeCriticalConfig(1.8, 2.2, 60),
        makeCriticalConfig(2.2, 2.6, 25),
        makeCriticalConfig(2.6, 3.0, 12),
        makeCriticalConfig(3.0, 3.5, 3),
      ],
    };
  }

  getSkillOneDamage() {
    const damage = Math.floor(this.getNormalDamage() * this.skillOne.rate);
    if (!this.isCritical(this.skillOne.criticalRate)) {
      return damage;
    }

    const bonus = this.calculateCriticalBonus(this.skillOne.criticalConfig);
    return Math.floor(damage * bonus);
  }
}

class Thief extends Adventurer {
  static get key() {
    return "thief";
  }

  constructor({ level }) {
    super({ level });
    this.key = "thief";
    this.power = 1;
  }

  get skillOne() {
    return {
      name: "致命一擊",
      description: "高風險高回報的攻擊，有機會造成巨額傷害",
      cost: 20,
      rate: 1.5,
      criticalRate: 50,
      criticalConfig: [
        makeCriticalConfig(1.2, 1.5, 10),
        makeCriticalConfig(1.5, 2.0, 25),
        makeCriticalConfig(2.0, 2.8, 35),
        makeCriticalConfig(2.8, 3.8, 25),
        makeCriticalConfig(3.8, 5.0, 5),
      ],
    };
  }

  getSkillOneDamage() {
    const damage = Math.floor(this.getNormalDamage() * this.skillOne.rate);
    if (!this.isCritical(this.skillOne.criticalRate)) {
      return damage;
    }

    const bonus = this.calculateCriticalBonus(this.skillOne.criticalConfig);
    return Math.floor(damage * bonus);
  }
}

exports.Adventurer = Adventurer;
exports.Swordman = Swordman;
exports.Mage = Mage;
exports.Thief = Thief;

exports.make = (jobKey, { level }) => {
  switch (jobKey) {
    case Swordman.key:
      return new Swordman({ level });
    case Mage.key:
      return new Mage({ level });
    case Thief.key:
      return new Thief({ level });
    default:
      return new Adventurer({ level });
  }
};
