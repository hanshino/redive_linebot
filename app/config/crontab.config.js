module.exports = [
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
