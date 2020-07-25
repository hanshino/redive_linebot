["Guild", "GuildBattle", "GuildMembers", "CustomerOrder", "IanUser", "User", "GuildWeek"].forEach(
  file => {
    exports[file] = require(`./${file}`);
  }
);
