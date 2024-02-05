const base = require("../base");

class MinigameJob extends base {}

const minigameJob = new MinigameJob({ table: "minigame_job" });

class Adventurer {
  static get key() {
    return "adventurer";
  }
  constructor({ level }) {
    this.level = level;
    this.key = "adventurer";
    this.power = 1;
  }

  async getJobName() {
    return await minigameJob.first({ filter: { key: this.key } });
  }

  attack() {
    return this.getStandardDamage();
  }

  getStandardDamage() {
    const damage = Math.floor(Math.pow(this.level, 2)) + this.level * 10;
    // 職業補正
    return Math.floor(damage * this.power);
  }
}

class Swordman extends Adventurer {
  static get key() {
    return "swordman";
  }
  constructor({ level }) {
    super({ level });
    this.key = "swordman";
    this.power = 1.5;
  }
}

class Mage extends Adventurer {
  static get key() {
    return "mage";
  }
  constructor({ level }) {
    super({ level });
    this.key = "mage";
    this.power = 0.8;
  }
}

class Thief extends Adventurer {
  static get key() {
    return "thief";
  }
  constructor({ level }) {
    super({ level });
    this.key = "thief";
    this.power = 1.2;
  }
}

exports.Adventurer = Adventurer;
exports.Swordman = Swordman;
exports.Mage = Mage;
exports.Thief = Thief;
