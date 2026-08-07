const { text } = require("bottender/router");
const PublicMarketService = require("../../service/PublicMarketService");
const { generateMarketBubble } = require("../../templates/application/PublicMarket");
const { DefaultLogger } = require("../../util/Logger");

exports.router = [text(/^[./#](市場|market)$/i, showMarket)];

/**
 * 顯示公開市場總覽
 * @param {import("bottender").LineContext} context
 */
async function showMarket(context) {
  const { userId } = context.event.source;
  if (!userId) return;

  try {
    const summary = await PublicMarketService.getSummary(userId);
    return context.replyFlex("公開市場", generateMarketBubble(summary));
  } catch (e) {
    DefaultLogger.error(e);
    return context.replyText("市場現在有點忙，等一下再試試");
  }
}

exports.showMarket = showMarket;
