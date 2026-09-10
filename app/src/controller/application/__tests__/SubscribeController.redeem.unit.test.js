// 兌換交易的「決策邏輯」單元測試：鎖序、重試分類、handleUser 延長/建立分支。
// model 層全部 mock，測的是 SubscribeController 內的決策，不是真實交易/併發。
//
// 這不是規格 §11 要求的
// `SubscribeController.redeem.test.js`（真實本機隔離測試 DB、真正交易重疊，
// 涵蓋雙玩家搶序號/雙序號並發/過期清理後重兌五種情境）——那支測試需要一個
// 安全的本機測試 MySQL 連線，本輪環境沒有提供（見完成回報的 blocker 說明），
// 此檔只覆蓋不需要真實 DB 也能驗證的決策分支，作為權宜的部分證據。
//
// 全域 setup.js 把 bottender/router 的 text() mock 成回傳 `jest.fn()`（丟棄真正的
// handler），這裡需要拿到真正的 action 函式，故對這個模組 unmock。
jest.unmock("bottender/router");
jest.mock("../../../model/application/SubscribeCard", () => ({ first: jest.fn() }));
jest.mock("../../../model/application/SubscribeCardCoupon", () => ({
  status: { unused: 0, used: 1 },
  table: "subscribe_card_coupon",
  lockBySerialNumber: jest.fn(),
}));
jest.mock("../../../model/application/SubscribeUser", () => ({
  lockByUserAndCard: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}));
jest.mock("../../../model/application/Inventory", () => ({
  inventory: { getUserMoney: jest.fn(), decreaseGodStone: jest.fn() },
}));
jest.mock("../../princess/gacha", () => ({ purgeDailyGachaCache: jest.fn() }));
jest.mock("../../../../bin/DailyRation", () => jest.fn());
jest.mock("../../../service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));
jest.mock("../../../service/achievementNotifier", () => ({
  notifyUnlocks: jest.fn().mockResolvedValue(undefined),
}));

const SubscribeCard = require("../../../model/application/SubscribeCard");
const SubscribeCardCoupon = require("../../../model/application/SubscribeCardCoupon");
const SubscribeUser = require("../../../model/application/SubscribeUser");
const mysql = require("../../../util/mysql");
const GachaController = require("../../princess/gacha");
const SubscribeController = require("../SubscribeController");

function ctx(userId = "U" + "1".repeat(32)) {
  return {
    event: { source: { userId } },
    replyText: jest.fn().mockResolvedValue(undefined),
    sendText: jest.fn().mockResolvedValue(undefined),
  };
}

function props(serialNumber = "s".repeat(36)) {
  return { match: { groups: { serial_number: serialNumber } } };
}

function callExchange(context, serialNumber) {
  const handler = SubscribeController.router.find(
    r => typeof r.predicate === "function" && r.action.name === "subscribeCouponExchange"
  );
  return handler.action(context, props(serialNumber));
}

beforeEach(() => {
  jest.clearAllMocks();
  mysql.transaction.mockImplementation(cb => cb(mysql));
  mysql.update.mockReturnValue(mysql);
  // 全域 mock 的 chainMethods 清單沒有 "table"（SubscribeController 用
  // `trx.update(...).table(...).where(...)` 這個寫法），這裡直接賦值補上。
  mysql.table = jest.fn().mockReturnValue(mysql);
  mysql.where.mockResolvedValue(1);
  SubscribeCard.first.mockResolvedValue({
    key: "month",
    name: "月卡",
    duration: 30,
    effects: [],
  });
  SubscribeUser.create.mockResolvedValue(1);
  SubscribeUser.update.mockResolvedValue(1);
});

describe("subscribeCouponExchange：查無序號 / 已使用 / 查無卡片", () => {
  it("序號查無資料：不進交易，回覆查無此序號", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue(null);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(c.sendText).toHaveBeenCalledWith(
      expect.stringContaining("message.subscribe.serial_number_not_found")
    );
    expect(SubscribeUser.create).not.toHaveBeenCalled();
  });

  it("序號已使用：不進行任何寫入，回覆已使用", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({ id: 1, status: 1 });
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.subscribe.serial_number_used")
    );
    expect(SubscribeUser.create).not.toHaveBeenCalled();
  });

  it("卡片資料查無：回覆聯絡管理員，不寫入", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "ghost",
    });
    SubscribeCard.first.mockResolvedValue(null);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
    expect(SubscribeUser.create).not.toHaveBeenCalled();
  });
});

describe("subscribeCouponExchange：首次建立 vs 延長", () => {
  it("查無既有 subscribe_user：走建立路徑（isContinue=false）", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue(undefined);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(SubscribeUser.create).toHaveBeenCalledTimes(1);
    expect(SubscribeUser.update).not.toHaveBeenCalled();
    expect(GachaController.purgeDailyGachaCache).toHaveBeenCalledWith(c.event.source.userId);
  });

  it("已有未過期的 subscribe_user：走延長路徑（isContinue=true），呼叫 update 不呼叫 create", async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue({ id: 9, end_at: future });
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(SubscribeUser.update).toHaveBeenCalledTimes(1);
    expect(SubscribeUser.create).not.toHaveBeenCalled();
    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.subscribe.coupon_exchange_success_continue")
    );
  });

  it("已有但已過期的 subscribe_user：走重新開始路徑（isContinue=false），仍是 update 不是 create", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue({ id: 9, end_at: past });
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(SubscribeUser.update).toHaveBeenCalledTimes(1);
    expect(c.replyText).not.toHaveBeenCalledWith(
      expect.stringContaining("coupon_exchange_success_continue")
    );
  });
});

describe("subscribeCouponExchange：重試分類與次數上限", () => {
  it("ER_LOCK_DEADLOCK 會重試，最終成功則總嘗試不超過 3 次", async () => {
    let call = 0;
    SubscribeCardCoupon.lockBySerialNumber.mockImplementation(async () => {
      call += 1;
      if (call < 3) throw Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK" });
      return { id: 1, status: 0, subscribe_card_key: "month" };
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue(undefined);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(call).toBe(3);
    expect(SubscribeUser.create).toHaveBeenCalledTimes(1);
  });

  it("超過重試上限（連續 3 次 deadlock）最終回報聯絡管理員，不假裝成功", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockRejectedValue(
      Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK" })
    );
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(SubscribeCardCoupon.lockBySerialNumber).toHaveBeenCalledTimes(3);
    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
  });

  it("ER_DUP_ENTRY 但不是 subscribe_user 複合唯一鍵 —— 不重試，直接回報失敗", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue(undefined);
    SubscribeUser.create.mockRejectedValue(
      Object.assign(new Error("dup"), {
        code: "ER_DUP_ENTRY",
        sqlMessage: "Duplicate entry for key 'some_other_unique'",
      })
    );
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(SubscribeCardCoupon.lockBySerialNumber).toHaveBeenCalledTimes(1);
    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
  });

  it("subscribe_user 複合唯一鍵 ER_DUP_ENTRY 會重試（首次建立時的 INSERT 競態）", async () => {
    let createCalls = 0;
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      id: 9,
      end_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    });
    SubscribeUser.create.mockImplementation(async () => {
      createCalls += 1;
      throw Object.assign(new Error("dup"), {
        code: "ER_DUP_ENTRY",
        sqlMessage:
          "Duplicate entry for key 'subscribe_user.subscribe_user_user_id_subscribe_card_key_unique'",
      });
    });
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    // 第一次 lockByUserAndCard 沒讀到既有列 -> 走 create -> 撞唯一鍵 -> 重試；
    // 第二次重讀到既有列 -> 改走 update。
    expect(createCalls).toBe(1);
    expect(SubscribeUser.update).toHaveBeenCalledTimes(1);
  });

  it("非分類內錯誤（例如一般連線錯誤）一律不重試，直接失敗", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockRejectedValue(new Error("ECONNRESET"));
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(SubscribeCardCoupon.lockBySerialNumber).toHaveBeenCalledTimes(1);
    expect(c.replyText).toHaveBeenCalledWith(
      expect.stringContaining("message.error_contact_admin")
    );
  });

  it("sentinel：Knex 例外 message/sqlMessage 帶假金額/序號時，console.error 絕不能印出該原始字串", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const SENTINEL_AMOUNT = "8888888.88";
    const SENTINEL_SERIAL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sqlLikeError = Object.assign(
      new Error(
        `update subscribe_card_coupon set used_by='${SENTINEL_SERIAL}' where amount=${SENTINEL_AMOUNT}`
      ),
      {
        code: "ER_LOCK_DEADLOCK",
        sqlMessage: `Deadlock found on serial='${SENTINEL_SERIAL}' amount=${SENTINEL_AMOUNT}`,
      }
    );
    // 連續 3 次都丟這個帶敏感值的錯誤，逼進最終的「未分類/重試上限」log 路徑。
    SubscribeCardCoupon.lockBySerialNumber.mockRejectedValue(sqlLikeError);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    const loggedText = spy.mock.calls.map(args => args.join(" ")).join("\n");
    expect(loggedText).not.toContain(SENTINEL_AMOUNT);
    expect(loggedText).not.toContain(SENTINEL_SERIAL);
    spy.mockRestore();
  });
});

describe("subscribeCouponExchange：副作用在交易之外", () => {
  it("成功後才呼叫 purgeDailyGachaCache / AchievementEngine.evaluate", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue(undefined);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(GachaController.purgeDailyGachaCache).toHaveBeenCalledTimes(1);
  });

  it("失敗時不呼叫任何成功副作用", async () => {
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue(null);
    const c = ctx();

    await callExchange(c, "s".repeat(36));

    expect(GachaController.purgeDailyGachaCache).not.toHaveBeenCalled();
  });

  it("commit 後的副作用（purgeDailyGachaCache）失敗，不會觸發重新開一個兌換交易", async () => {
    // 見 docs/plans/2026-09-09-sponsorship-admin-v1-plan.md §7：兌換交易本身的
    // 重試（deadlock/唯一鍵競態）只包在 exchangeCouponWithRetry 內；一旦交易 commit
    // 成功，後續的快取清除等副作用即使失敗，也絕不能倒回去重跑整筆兌換交易
    // （否則同一張序號可能被判定「已使用」而重複觸發 SubscribeUser 的建立/更新）。
    SubscribeCardCoupon.lockBySerialNumber.mockResolvedValue({
      id: 1,
      status: 0,
      subscribe_card_key: "month",
    });
    SubscribeUser.lockByUserAndCard.mockResolvedValue(undefined);
    GachaController.purgeDailyGachaCache.mockRejectedValue(new Error("cache down"));
    const c = ctx();

    await expect(callExchange(c, "s".repeat(36))).rejects.toThrow("cache down");

    expect(SubscribeCardCoupon.lockBySerialNumber).toHaveBeenCalledTimes(1);
    expect(SubscribeUser.create).toHaveBeenCalledTimes(1);
  });
});
