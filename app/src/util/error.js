module.exports = {
  sendError: function (context, errMsg) {
    switch (context.platform) {
      case "line":
        context.quoteReply(errMsg);
        break;
      case "telegram":
        context.sendMessage(errMsg);
        break;
      default:
        context.reply(errMsg);
    }
  },
};
