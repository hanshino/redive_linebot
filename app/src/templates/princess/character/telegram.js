module.exports = {
  showInfo: function (context, name) {
    context.replyText(`${name}的資訊`);
  },

  showSkill: function (context, name) {
    context.replyText(`${name}的技能一覽`);
  },

  showAction: function (context, name) {
    context.replyText(`${name}的行動模式`);
  },

  showUniqEquip: function (context, name) {
    context.replyText(`${name}的專武清單`);
  },

  showEquipRequire: function (context, name) {
    context.replyText(`${name}的裝備需求清單`);
  },

  showCharacter: function (context, name) {
    context.replyText(`${name}的角色資訊`);
  },

  showRecommend: function (context, name) {
    context.replyText(`${name}的角色Rank推薦`);
  },
};
