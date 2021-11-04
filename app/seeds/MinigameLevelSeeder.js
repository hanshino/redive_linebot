const expData = require("../doc/ExpUnit.json");
exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex("minigame_level_unit")
    .del()
    .then(function () {
      // Inserts seed entries
      return knex("minigame_level_unit").insert(expData);
    });
};
