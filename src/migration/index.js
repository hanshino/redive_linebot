[
  "Guild",
  "GuildBattle",
  "GuildMembers",
  "CustomerOrder",
  "IanUser",
  "User",
  "GuildWeek",
  "GuildConfig",
].forEach(file => {
  exports[file] = require(`./${file}`);
});
