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
  "Inventory",
  "GachaSignin",
].forEach(file => {
  exports[file] = require(`./${file}`);
});
