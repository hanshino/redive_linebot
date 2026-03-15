const AVATAR_BASE = "https://chieru.hanshino.dev/assets/units/head";

// picUnitId = unit_id + 30 (3星版本)
exports.up = function (knex) {
  return knex("race_character").insert([
    { name: "佩可莉姆", avatar_url: `${AVATAR_BASE}/105831.png` },
    { name: "可可蘿", avatar_url: `${AVATAR_BASE}/105931.png` },
    { name: "凱留", avatar_url: `${AVATAR_BASE}/106031.png` },
    { name: "宮子", avatar_url: `${AVATAR_BASE}/100731.png` },
    { name: "黑騎", avatar_url: `${AVATAR_BASE}/107131.png` },
    { name: "似似花", avatar_url: `${AVATAR_BASE}/107031.png` },
    { name: "初音", avatar_url: `${AVATAR_BASE}/101231.png` },
    { name: "璃乃", avatar_url: `${AVATAR_BASE}/101131.png` },
  ]);
};

exports.down = function (knex) {
  return knex("race_character").del();
};
