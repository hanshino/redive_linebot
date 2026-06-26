const characters = require("../doc/characterInfo.json");
const _ = require("lodash");

exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex("gacha_pool")
    .del()
    .then(function () {
      // Inserts seed entries

      return Promise.all(
        _.chunk(characters, 50).map(data => {
          return knex("gacha_pool").insert(
            data.map(char => ({
              Name: char.Name,
              HeadImage_Url: char.HeadImage,
              Star: char.Star,
              Rate: _.sample(["0.035", "4.187", "0.666"]),
              Is_Princess: 1,
            }))
          );
        })
      );
    })
    .then(function () {
      console.log("Insert Success");
    });
};
