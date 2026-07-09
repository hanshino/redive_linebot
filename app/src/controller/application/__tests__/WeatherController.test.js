jest.mock("../../../service/ChatWeatherService", () => ({
  describeToday: jest.fn(),
}));

const WeatherService = require("../../../service/ChatWeatherService");
const WeatherController = require("../WeatherController");

const makeContext = (userId = "U" + "a".repeat(32)) => ({
  event: { source: { userId } },
  replyText: jest.fn().mockResolvedValue({}),
});

beforeEach(() => jest.clearAllMocks());

describe("WeatherController.showToday", () => {
  it("replies the weather description", async () => {
    WeatherService.describeToday.mockResolvedValue("今日天氣：晴空回音");
    const context = makeContext();
    await WeatherController.showToday(context);
    expect(WeatherService.describeToday).toHaveBeenCalledWith(context.event.source.userId);
    expect(context.replyText).toHaveBeenCalledWith("今日天氣：晴空回音");
  });

  it("rejects when there is no userId", async () => {
    const context = makeContext(null);
    await WeatherController.showToday(context);
    expect(context.replyText).toHaveBeenCalledWith("獲取失敗，無法辨識用戶");
    expect(WeatherService.describeToday).not.toHaveBeenCalled();
  });
});
