module.exports = {
  sendError: function (context, errMsg) {
    switch (context.platform) {
      case "line":
        context.replyText(errMsg);
        break;
      case "telegram":
        context.sendMessage(errMsg);
        break;
      default:
        context.reply(errMsg);
    }
  },
};
