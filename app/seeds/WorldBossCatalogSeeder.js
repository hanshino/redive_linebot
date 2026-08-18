const BOSSES = [
  {
    id: 1,
    name: "山嶺巨像",
    description: "盤踞於蘭德索爾山脈的古老魔像。",
    hp_weight: 1,
    image: null,
  },
  {
    id: 2,
    name: "深淵雙頭犬",
    description: "來自地底裂縫的看門猛獸。",
    hp_weight: 0.9,
    image: null,
  },
  {
    id: 3,
    name: "暴風飛龍",
    description: "翼展遮天的暴風化身。",
    hp_weight: 1.1,
    image: null,
  },
  {
    id: 4,
    name: "冥府騎士",
    description: "披著破碎鎧甲的無言騎士。",
    hp_weight: 1.25,
    image: null,
  },
  {
    id: 5,
    name: "潮汐海皇",
    description: "自深海祭壇甦醒的水之支配者。",
    hp_weight: 1.4,
    image: null,
  },
];

exports.buildRows = () => BOSSES;
exports.seed = knex => knex("world_boss").insert(BOSSES).onConflict("id").ignore();
