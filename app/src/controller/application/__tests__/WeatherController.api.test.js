jest.mock("../../../service/ChatWeatherService", () => ({
  getTodayStatus: jest.fn(),
  purchaseTodayProtection: jest.fn(),
}));

const WeatherService = require("../../../service/ChatWeatherService");
const WeatherController = require("../WeatherController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const req = { profile: { userId: "U" + "a".repeat(32) } };

beforeEach(() => jest.clearAllMocks());

describe("apiGetToday", () => {
  it("returns status with snake_case balance key", async () => {
    WeatherService.getTodayStatus.mockResolvedValue({
      date: "2026-07-09",
      weather: { weather_key: "noisy_wind" },
      protection: null,
      godStoneBalance: 860,
    });
    const res = makeRes();
    await WeatherController.apiGetToday(req, res);
    expect(res.json).toHaveBeenCalledWith({
      date: "2026-07-09",
      weather: { weather_key: "noisy_wind" },
      protection: null,
      god_stone_balance: 860,
    });
  });
});

describe("apiPurchase", () => {
  it("200 on success", async () => {
    WeatherService.purchaseTodayProtection.mockResolvedValue({ ok: true, protection: { id: 1 } });
    const res = makeRes();
    await WeatherController.apiPurchase(req, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true, protection: { id: 1 } });
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([["NO_PROTECTION"], ["ALREADY_PROTECTED"], ["INSUFFICIENT_STONE"], ["DISABLED"]])(
    "400 + code on %s",
    async code => {
      WeatherService.purchaseTodayProtection.mockResolvedValue({ ok: false, code });
      const res = makeRes();
      await WeatherController.apiPurchase(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
    }
  );
});
