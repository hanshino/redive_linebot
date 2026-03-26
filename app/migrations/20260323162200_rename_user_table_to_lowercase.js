exports.up = function (knex) {
  return knex.raw("RENAME TABLE `User` TO `user`");
};

exports.down = function (knex) {
  return knex.raw("RENAME TABLE `user` TO `User`");
};
