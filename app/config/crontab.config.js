module.exports = [
  {
    name: "Fetch Game Data",
    description: "princess connect re:dive data up to date",
    period: ["0", "5", "9-21", "*", "*", "*"],
    immediate: process.env.NODE_ENV === "production",
    require_path: "./bin/FetchGameData",
  },
  {
    name: "Clan Fetch",
    description: "clan fetch",
    period: ["0", "*/5", "*", "20-31", "*", "*"],
    immediate: process.env.NODE_ENV === "production",
    require_path: "./bin/ClanFetch",
  },
  {
    name: "Daily Ration",
    description: "daily ration",
    period: ["10", "*/10", "*", "*", "*", "*"],
    immediate: true,
    require_path: "./bin/DailyRation",
  },
  {
    name: "Clean Expired Subscriber",
    description: "clean expired subscriber",
    period: ["0", "0", "0", "*", "*", "*"],
    immediate: true,
    require_path: "./bin/CleanExpiredSubscriber",
  },
];
