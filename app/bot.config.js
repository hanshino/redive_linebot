// State TTL is 3600 seconds, configured in src/lib/bot/native/state-store.js.
module.exports = {
  initialState: {
    userDatas: {},
    groupDatas: {},
    sentCoolDown: {},
    guildConfig: {
      Battle: "Y",
      PrincessCharacter: "Y",
      CustomerOrder: "Y",
      GlobalOrder: "Y",
      Gacha: "Y",
      PrincessInformation: "Y",
    },
    arena: {},
  },
};
