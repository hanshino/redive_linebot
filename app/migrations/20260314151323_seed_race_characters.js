exports.up = function (knex) {
  return knex("race_character").insert([
    { name: "佩可莉姆" },
    { name: "可可蘿" },
    { name: "凱留" },
    { name: "宮子" },
    { name: "黑騎" },
    { name: "似似花" },
    { name: "初音" },
    { name: "璃乃" },
  ]);
};

exports.down = function (knex) {
  return knex("race_character").del();
};
