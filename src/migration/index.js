[
  "Guild",
  "GuildBattle",
  "GuildMembers",
  "CustomerOrder",
  "IanUser",
  "User",
  "GuildWeek",
  "GuildConfig",
  "GachaPool",
  "Admin",
  "GlobalOrders",
].forEach(file => {
  exports[file] = require(`./${file}`);
});
