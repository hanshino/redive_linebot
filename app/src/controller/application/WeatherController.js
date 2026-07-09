const WeatherService = require("../../service/ChatWeatherService");

exports.showToday = async context => {
  const { userId } = context.event.source;
  if (!userId) {
    return context.replyText("獲取失敗，無法辨識用戶");
  }
  const text = await WeatherService.describeToday(userId);
  return context.replyText(text);
};
