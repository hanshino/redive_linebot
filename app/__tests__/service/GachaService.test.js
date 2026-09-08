// GachaService.runDailyDraw — unit tests targeting the side-effect ledger
// contract documented in .omc/plans/2026-04-18-subscriber-auto-actions.md §13.

jest.mock("../../src/model/princess/gacha", () => ({
  getDatabasePool: jest.fn(),
  getUserGodStoneCount: jest.fn(),
  getPrincessCharacterCount: jest.fn(),
}));

jest.mock("../../src/model/princess/GachaBanner", () => ({
  getActiveBannersWithCharacters: jest.fn().mockResolvedValue([]),
}));

// Transaction builder — records inserts per-table for post-hoc assertions.
const txInserts = [];
function makeTrxBuilder() {
  const trx = tableName => ({
    insert: jest.fn(async rows => {
      txInserts.push({ table: tableName, rows });
      // Simulate AUTO_INCREMENT: return [1] for gacha_record, [0] for others.
      return tableName === "gacha_record" ? [42] : [0];
    }),
  });
  trx.commit = jest.fn().mockResolvedValue(undefined);
  trx.rollback = jest.fn().mockResolvedValue(undefined);
  return trx;
}
let currentTrx;

// 使用者「抽卡前」已持有的角色 id；測試改這個陣列就能控制新角色／重複的比例。
let ownItemIdsStub = [];

// 碎片 model 整支 mock 掉，不讓 makeTrxBuilder 去模擬 knex 的 upsert 鏈。
// `increase()` 真正的形狀是 `.insert().onConflict().merge()` 再加上
// `this.connection.raw` / `connection.fn.now()`，要在假 trx 上重現那條鏈等於
// 在測試裡重寫一份 knex —— 那測到的是 knex 而不是 GachaService。
// 這一層真正要固定的契約只有兩件事：碎片用「哪些參數」入帳、以及有沒有用「同一個 trx」，
// 兩者都能直接從 increase 的 mock.calls 讀出來，比爬 insert payload 更有辨識力。
jest.mock("../../src/model/princess/CharacterFragment", () => ({
  increase: jest.fn().mockResolvedValue([0]),
}));

jest.mock("../../src/model/application/Inventory", () => {
  const inventory = {
    table: "inventory",
    transaction: jest.fn(async () => {
      currentTrx = makeTrxBuilder();
      return currentTrx;
    }),
    // `inventory.knex` is used to read own-items before the trx. We stub it
    // via a getter so the query-chain returns the staged array.
  };
  Object.defineProperty(inventory, "knex", {
    get: () => {
      const chain = {};
      chain.where = jest.fn(() => chain);
      chain.select = jest.fn(() => chain);
      chain.andWhereNot = jest.fn(() => chain);
      chain.orderBy = jest.fn(() => Promise.resolve(ownItemIdsStub.map(itemId => ({ itemId }))));
      return chain;
    },
  });
  return { inventory };
});

jest.mock("../../src/model/princess/GachaRecord", () => ({
  table: "gacha_record",
}));
jest.mock("../../src/model/princess/GachaRecordDetail", () => ({
  table: "gacha_record_detail",
}));
jest.mock("../../src/service/SigninService", () => ({
  recordNormal: jest.fn(),
  evaluateAchievements: jest.fn().mockResolvedValue({ unlocked: [] }),
}));

jest.mock("../../src/service/EventCenterService", () => ({
  add: jest.fn().mockResolvedValue(undefined),
  getEventName: jest.fn(name => `event_center:${name}`),
}));
jest.mock("../../src/service/AchievementEngine", () => ({
  evaluate: jest.fn().mockResolvedValue({ unlocked: [] }),
}));

jest.mock("config", () => ({
  get: jest.fn(key => {
    const values = {
      "gacha.pick_up_cost": 1500,
      "gacha.ensure_cost": 3000,
      "gacha.europe_cost": 5000,
      "gacha.silver_repeat_reward": 1,
      "gacha.gold_repeat_reward": 10,
      "gacha.rainbow_repeat_reward": 50,
    };
    return values[key];
  }),
}));

const GachaModel = require("../../src/model/princess/gacha");
const GachaBanner = require("../../src/model/princess/GachaBanner");
const GachaService = require("../../src/service/GachaService");
const CharacterFragment = require("../../src/model/princess/CharacterFragment");
const mysql = require("../../src/util/mysql");
const EventCenterService = require("../../src/service/EventCenterService");
const AchievementEngine = require("../../src/service/AchievementEngine");
const signinService = require("../../src/service/SigninService");

function makePool() {
  return [
    { id: 1, name: "silver-1", rate: "70%", star: "1", isPrincess: "1" },
    { id: 2, name: "gold-2", rate: "25%", star: "2", isPrincess: "1" },
    { id: 3, name: "rainbow-3", rate: "5%", star: "3", isPrincess: "1" },
  ];
}

describe("GachaService.runDailyDraw", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    txInserts.length = 0;
    ownItemIdsStub = [];
    CharacterFragment.increase.mockResolvedValue([0]);
    // The write path now runs inside `mysql.transaction(async trx => ...)`.
    // Invoke the callback with a capturing trx so inserts land in `txInserts`.
    currentTrx = makeTrxBuilder();
    mysql.transaction.mockImplementation(async cb =>
      typeof cb === "function" ? cb(currentTrx) : currentTrx
    );
    GachaModel.getDatabasePool.mockResolvedValue(makePool());
    GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([]);
    signinService.recordNormal.mockResolvedValue({ created: true, date: "2026-08-07" });
    signinService.evaluateAchievements.mockResolvedValue({ unlocked: [] });
  });

  it("returns plain-data shape with exactly the seven documented keys", async () => {
    const result = await GachaService.runDailyDraw("Utest_user_1");

    expect(result).toBeDefined();
    expect(Object.keys(result).sort()).toEqual(
      [
        "fragmentRewards",
        "godStoneCost",
        "newCharacters",
        "ownCharactersCount",
        "rareCount",
        "rewards",
        "unlocks",
      ].sort()
    );
    expect(Array.isArray(result.rewards)).toBe(true);
    expect(result.rewards.length).toBe(10);
    expect(typeof result.rareCount).toBe("object");
    expect(Array.isArray(result.newCharacters)).toBe(true);
    expect(typeof result.ownCharactersCount).toBe("number");
    expect(Array.isArray(result.fragmentRewards)).toBe(true);
    expect(typeof result.godStoneCost).toBe("number");
    expect(Array.isArray(result.unlocks)).toBe(true);
  });

  it("does not return the removed repeatReward key（重複角色改發碎片）", async () => {
    const result = await GachaService.runDailyDraw("Uno_repeat");
    expect(result).not.toHaveProperty("repeatReward");
  });

  it("does not return any context/reply-flavoured keys", async () => {
    const result = await GachaService.runDailyDraw("Utest_user_2");
    expect(result).not.toHaveProperty("context");
    expect(result).not.toHaveProperty("reply");
    expect(result).not.toHaveProperty("bubble");
    expect(result).not.toHaveProperty("message");
  });

  it("invokes recordNormal, EventCenterService.add, AchievementEngine.evaluate with the contract args", async () => {
    await GachaService.runDailyDraw("Uabc");

    expect(signinService.recordNormal).toHaveBeenCalledTimes(1);
    expect(signinService.recordNormal).toHaveBeenCalledWith("Uabc", { trx: currentTrx });

    expect(EventCenterService.add).toHaveBeenCalledTimes(1);
    expect(EventCenterService.add).toHaveBeenCalledWith("event_center:daily_quest", {
      userId: "Uabc",
    });

    expect(AchievementEngine.evaluate).toHaveBeenCalledTimes(1);
    const [userIdArg, eventArg, metaArg] = AchievementEngine.evaluate.mock.calls[0];
    expect(userIdArg).toBe("Uabc");
    expect(eventArg).toBe("gacha_pull");
    expect(metaArg).toHaveProperty("threeStarCount");
    expect(metaArg).toHaveProperty("uniqueCount");
    expect(metaArg).toHaveProperty("pullType");
  });

  describe("signin integration", () => {
    it("records the signin inside the same transaction as the gacha writes", async () => {
      await GachaService.runDailyDraw("Utx");

      // 同一個 trx 物件 = 同一筆交易；轉蛋回滾時簽到跟著消失。
      const [, opts] = signinService.recordNormal.mock.calls[0];
      expect(opts.trx).toBe(currentTrx);
      expect(txInserts.some(t => t.table === "gacha_record")).toBe(true);
    });

    it("evaluates the signin achievement only when a new ledger row was created", async () => {
      await GachaService.runDailyDraw("Ufirst");
      expect(signinService.evaluateAchievements).toHaveBeenCalledWith("Ufirst", {
        source: "normal",
        date: "2026-08-07",
      });
    });

    it("skips signin achievement evaluation when the day was already signed", async () => {
      signinService.recordNormal.mockResolvedValue({ created: false, date: "2026-08-07" });

      await GachaService.runDailyDraw("Usecond");

      expect(signinService.evaluateAchievements).not.toHaveBeenCalled();
      // 轉蛋成就仍照跑 —— 每日額度內的第二抽不該被簽到狀態影響。
      expect(AchievementEngine.evaluate).toHaveBeenCalledTimes(1);
    });

    it("merges signin unlocks with gacha unlocks in the returned unlocks array", async () => {
      AchievementEngine.evaluate.mockResolvedValue({ unlocked: [{ key: "gacha_first" }] });
      signinService.evaluateAchievements.mockResolvedValue({
        unlocked: [{ key: "signin_secret" }],
      });

      const result = await GachaService.runDailyDraw("Umerge");

      expect(result.unlocks.map(u => u.key)).toEqual(["gacha_first", "signin_secret"]);
    });

    it("still returns a result when signin achievement evaluation yields nothing", async () => {
      AchievementEngine.evaluate.mockResolvedValue({ unlocked: [] });
      signinService.evaluateAchievements.mockResolvedValue({ unlocked: undefined });
      const result = await GachaService.runDailyDraw("Uempty");
      expect(result.unlocks).toEqual([]);
    });
  });

  it("writes one GachaRecord row and one GachaRecordDetail row per pulled character", async () => {
    await GachaService.runDailyDraw("Uledger");

    const gachaRecordInserts = txInserts.filter(t => t.table === "gacha_record");
    const detailInserts = txInserts.filter(t => t.table === "gacha_record_detail");
    expect(gachaRecordInserts.length).toBe(1);
    expect(detailInserts.length).toBe(1);
    expect(Array.isArray(detailInserts[0].rows)).toBe(true);
    expect(detailInserts[0].rows.length).toBe(10);
    for (const row of detailInserts[0].rows) {
      expect(row.gacha_record_id).toBe(42);
      expect(row.user_id).toBe("Uledger");
      expect(typeof row.character_id).toBe("number");
      expect(typeof row.star).toBe("number");
      expect(row.is_new === 1 || row.is_new === 0).toBe(true);
    }
  });

  it("runs the write path inside a single transaction and resolves on success", async () => {
    const result = await GachaService.runDailyDraw("Ucommit");
    // knex's callback form auto-commits on resolve; we assert the path ran once
    // to completion (the gacha_record write was captured inside the trx).
    expect(mysql.transaction).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
    expect(txInserts.some(t => t.table === "gacha_record")).toBe(true);
  });

  it("accepts only a userId (no bottender context) without throwing", async () => {
    await expect(GachaService.runDailyDraw("Uonly")).resolves.toBeDefined();
  });

  it("sets godStoneCost=0 when no special draw flags are passed", async () => {
    const result = await GachaService.runDailyDraw("Ufree");
    expect(result.godStoneCost).toBe(0);
    const costInserts = txInserts.filter(
      t => t.table === "inventory" && t.rows.itemId === 999 && t.rows.itemAmount < 0
    );
    expect(costInserts.length).toBe(0);
  });

  describe("Mode specific tests", () => {
    it("europe: costs 5000 and all rewards are 3-star", async () => {
      const result = await GachaService.runDailyDraw("Ueuro", { europe: true });
      expect(result.godStoneCost).toBe(5000);
      expect(result.rewards.every(r => r.star == "3")).toBe(true);
      expect(result.rareCount["3"]).toBe(10);

      const costInsert = txInserts.find(
        t => t.table === "inventory" && t.rows.itemId === 999 && t.rows.itemAmount === -5000
      );
      expect(costInsert).toBeDefined();
    });

    it("europe: uses banner cost if active", async () => {
      GachaBanner.getActiveBannersWithCharacters.mockResolvedValue([
        { type: "europe", cost: 4444 },
      ]);
      const result = await GachaService.runDailyDraw("Ubanner", { europe: true });
      expect(result.godStoneCost).toBe(4444);
    });

    it("pickup: costs 1500 and invokes pickup logic (verified via godStoneCost)", async () => {
      const result = await GachaService.runDailyDraw("Upick", { pickup: true });
      expect(result.godStoneCost).toBe(1500);
    });

    it("ensure: costs 3000 and the last reward is guaranteed 3-star", async () => {
      // Force the pool so that 1-star dominates natural draws (rate so high that 3-star's
      // 1% is statistically negligible over 10 pulls), while keeping rainbow rate > 0 so
      // the ensure-mode rainbow pool can still produce a reward via play().
      GachaModel.getDatabasePool.mockResolvedValue([
        { id: 1, name: "silver-1", rate: "10000%", star: "1", isPrincess: "1" },
        { id: 3, name: "rainbow-3", rate: "1%", star: "3", isPrincess: "1" },
      ]);

      const result = await GachaService.runDailyDraw("Uensure", { ensure: true });
      expect(result.godStoneCost).toBe(3000);
      expect(result.rewards.length).toBe(10);
      expect(result.rewards[9].star).toBe("3");
      // The other 9 should be 1-star based on our forced pool (natural rainbow chance ≈ 0.01%).
      const oneStars = result.rewards.slice(0, 9);
      expect(oneStars.every(r => r.star == "1")).toBe(true);
    });
  });

  // 重複角色的獎勵從「女神石入帳」換成「角色專屬碎片」。這一段是那次換血的迴歸網：
  // 恢復女神石入帳、或把碎片寫到交易外，都要在這裡爆掉。
  //
  // 這裡的池用 2★ 而非 1★ 純粹是「十抽必然同一隻」最省事的寫法；
  // 純 1★ 的池以前會讓 drawRewards 的保底無限重抽（livelock），現在已由
  // MAX_PITY_REDRAWS 修掉（見本檔最後的「保底重抽的終止性」一節），
  // 所以 1★ 池也能安全使用了 —— 見該節的單一 1★ 角色池案例。
  describe("重複角色發碎片（取代女神石入帳）", () => {
    // 單一 2★ 角色池 ⇒ 十抽必然十張同一隻，重複路徑一定會被走到。
    const singleGoldPool = [{ id: 2, name: "gold-2", rate: "100%", star: "2", isPrincess: "1" }];

    it("重複角色不再有任何 999 正數入帳，只走碎片", async () => {
      GachaModel.getDatabasePool.mockResolvedValue(singleGoldPool);

      const result = await GachaService.runDailyDraw("Ufragment_only");

      // 十張同一隻新角色：第一張入帳成角色，其餘 9 張換碎片（2★ = 10 片／張）。
      expect(result.newCharacters.map(c => c.id)).toEqual([2]);
      expect(result.fragmentRewards).toEqual([{ itemId: 2, name: "gold-2", amount: 90 }]);

      // 這個 filter 就是舊行為的探針：`itemAmount > 0` 的 999 列一出現，
      // 就代表重複角色又在發女神石了。
      const godStoneCredits = txInserts.filter(
        t => t.table === "inventory" && t.rows.itemId === 999 && t.rows.itemAmount > 0
      );
      expect(godStoneCredits).toEqual([]);
    });

    it("碎片用同一個 trx 入帳，抽卡回滾碎片就不會留下", async () => {
      GachaModel.getDatabasePool.mockResolvedValue(singleGoldPool);

      await GachaService.runDailyDraw("Utrx_fragment");

      // 碎片是資產：少傳 trx（或另開一筆交易）就會在轉蛋紀錄回滾後留下憑空的碎片。
      expect(CharacterFragment.increase).toHaveBeenCalledTimes(1);
      expect(CharacterFragment.increase).toHaveBeenCalledWith("Utrx_fragment", 2, 90, currentTrx);
    });

    it("已持有的角色：十抽全重複，一角色只打一次 upsert 而不是十次", async () => {
      ownItemIdsStub = [2];
      GachaModel.getDatabasePool.mockResolvedValue(singleGoldPool);

      const result = await GachaService.runDailyDraw("Uowned");

      // 已持有 ⇒ 沒有新角色，十張全部換碎片 = 100 片，且彙總成單一筆 upsert。
      expect(result.newCharacters).toEqual([]);
      expect(result.fragmentRewards).toEqual([{ itemId: 2, name: "gold-2", amount: 100 }]);
      expect(CharacterFragment.increase).toHaveBeenCalledTimes(1);
      expect(CharacterFragment.increase).toHaveBeenCalledWith("Uowned", 2, 100, currentTrx);
    });

    it("彩池十抽全重複時按 3★ 計價（50 片／張）", async () => {
      ownItemIdsStub = [3];
      GachaModel.getDatabasePool.mockResolvedValue([
        { id: 3, name: "rainbow-3", rate: "100%", star: "3", isPrincess: "1" },
      ]);

      const result = await GachaService.runDailyDraw("Urainbow");

      expect(result.fragmentRewards).toEqual([{ itemId: 3, name: "rainbow-3", amount: 500 }]);
    });

    it("沒有任何重複時不呼叫 increase", async () => {
      // 每個 fragmentRewards 元素對應一次 upsert，空陣列就必須一次都不打。
      expect(GachaService.computeFragmentRewards([{ id: 1, name: "a", star: "1" }], [])).toEqual(
        []
      );

      // 端到端：純新角色的情境無法用隨機抽卡穩定造出（十抽十種不同的機率 ≈ 0.04%），
      // 所以這裡只驗「碎片為空 ⇒ 不入帳」這條連結 —— 由上面的空陣列 + 下面的
      // 呼叫次數斷言共同鎖住 `for (const fragment of fragmentRewards)` 這個迴圈。
      GachaModel.getDatabasePool.mockResolvedValue(singleGoldPool);
      await GachaService.runDailyDraw("Uloop");
      expect(CharacterFragment.increase).toHaveBeenCalledTimes(1);
    });

    it("多角色重複時依 amount 由多至少排序，同 amount 以 itemId 排序", () => {
      // 直接測純函式：抽卡的隨機性沒辦法穩定造出「金 1 張 + 銀 2 張」這種組合。
      const uniqRewards = [
        { id: 5, name: "silver-5", star: "1" },
        { id: 3, name: "silver-3", star: "1" },
        { id: 9, name: "gold-9", star: "2" },
        { id: 7, name: "rainbow-7", star: "3" },
      ];
      // 銀 5 出現 3 張、銀 3 / 金 9 / 彩 7 各 1 張
      const duplicateItems = [5, 5, 5, 3, 9, 7];

      expect(GachaService.computeFragmentRewards(uniqRewards, duplicateItems)).toEqual([
        { itemId: 7, name: "rainbow-7", amount: 50 },
        { itemId: 9, name: "gold-9", amount: 10 },
        { itemId: 5, name: "silver-5", amount: 3 },
        { itemId: 3, name: "silver-3", amount: 1 },
      ]);
    });

    it("computeFragmentRewards 的星數計價：1★=1、2★=10、3★=50", () => {
      const uniqRewards = [
        { id: 1, name: "s", star: "1" },
        { id: 2, name: "g", star: "2" },
        { id: 3, name: "r", star: "3" },
      ];

      expect(GachaService.computeFragmentRewards(uniqRewards, [1])[0].amount).toBe(1);
      expect(GachaService.computeFragmentRewards(uniqRewards, [2])[0].amount).toBe(10);
      expect(GachaService.computeFragmentRewards(uniqRewards, [3])[0].amount).toBe(50);
    });
  });

  // 保底重抽的終止性
  //
  // 「十抽全 1★ 就重抽」原本寫成無界的 `while (rareCount[1] === 10)`。抽不出非 1★ 的池
  // （filterPool 對非公主 tag 走 `return resultPool`，不補其他星級）會讓條件恆真，
  // 同步佔住 event loop 讓整個 bot 停止回應。
  //
  // 為什麼不靠 jest timeout：那個迴圈是「同步」的無限迴圈，會把 event loop 整條吃掉，
  // jest 的 timeout 根本沒機會觸發 —— 還原 bug 後整個 worker 會直接卡死而不是判 fail。
  // 所以這裡改用「呼叫預算」：把 gachaDrawUtil.play 包一層計數器，單次 drawRewards
  // 超過預算就 throw。有修法時一次最多 20 輪、遠低於預算；還原成無界迴圈則會撞到預算而
  // 拋錯，變成一個秒殺的 assertion failure 而不是 hang。
  describe("保底重抽的終止性（livelock 迴歸）", () => {
    // 單次 drawRewards 的 play 呼叫預算。正常情況 ≤ MAX_PITY_REDRAWS（ensure 模式每輪
    // 兩次），200 給了十倍以上的餘裕，只有真正無界的迴圈才碰得到。
    const PLAY_BUDGET = 200;

    let budgetedService;
    let playCalls;

    beforeAll(() => {
      // 在獨立的 module registry 裡載入一份 GachaService，讓它拿到被包過的 play。
      // 不用全域 jest.mock：本檔其他 24 個 case 需要真實的 play。
      jest.isolateModules(() => {
        const realUtil = jest.requireActual("../../src/service/gachaDrawUtil");
        jest.doMock("../../src/service/gachaDrawUtil", () => ({
          ...realUtil,
          play: (pool, times) => {
            if (++playCalls > PLAY_BUDGET) {
              throw new Error(
                `play() 被呼叫超過 ${PLAY_BUDGET} 次 —— 保底重抽沒有終止條件（livelock 回歸）`
              );
            }
            return realUtil.play(pool, times);
          },
        }));
        budgetedService = require("../../src/service/GachaService");
      });
    });

    beforeEach(() => {
      playCalls = 0;
    });

    const onlySilver = [{ id: 1, name: "silver-1", rate: "100%", star: "1", isPrincess: "1" }];
    const opts = { userId: "Uterm", ensure: false };

    it("純 1★ 池會在上限內收斂而不是無限重抽", () => {
      const { rewards, rareCount } = budgetedService.drawRewards(onlySilver, 10, opts);

      // 池子只有 1★，所以結果本來就該是全 1★ —— 修法不是「想辦法湊出非 1★」，
      // 而是「放棄重抽、誠實回傳最後一次」。
      expect(rewards).toHaveLength(10);
      expect(rareCount[1]).toBe(10);
      expect(rewards.every(r => r.star === "1")).toBe(true);

      // 終止性的直接證據：重抽次數有界。
      expect(playCalls).toBeLessThanOrEqual(budgetedService.MAX_PITY_REDRAWS);
    });

    it("純 1★ 池在 ensure 模式下也會收斂", () => {
      // ensure 會 pop 掉最後一抽再從彩池補一張，但這個池沒有彩 ⇒ 補不回來。
      // 這裡要確認的是「不管保底條件成不成立都會結束」。
      const { rewards } = budgetedService.drawRewards(onlySilver, 10, {
        userId: "Uterm_ensure",
        ensure: true,
      });
      expect(Array.isArray(rewards)).toBe(true);
      expect(playCalls).toBeLessThanOrEqual(budgetedService.MAX_PITY_REDRAWS * 2);
    });

    it("上限是有限值，且大到正常池碰不到", () => {
      // 正式池 1★ 佔權重 81.433/394.383 ⇒ 十抽全 1★ ≈ 1.4e-7，連 20 次 ≈ 1e-138。
      // 上限存在（有限）是終止性的來源；夠大則保證正常抽卡的保底行為沒被削弱。
      expect(Number.isInteger(budgetedService.MAX_PITY_REDRAWS)).toBe(true);
      expect(budgetedService.MAX_PITY_REDRAWS).toBeGreaterThanOrEqual(2);
      expect(budgetedService.MAX_PITY_REDRAWS).toBeLessThanOrEqual(100);
    });

    it("抽得出非 1★ 的池：保底仍然生效，回傳結果不會總是全 1★", () => {
      // 1★ 吃 99% 權重、3★ 只有 1%：單次十抽全 1★ 的機率高（≈0.9），
      // 但保底會重抽到出現非 1★ 為止，所以「回傳值仍是全 1★」應該極少見。
      const skewed = [
        { id: 1, name: "silver-1", rate: "99%", star: "1", isPrincess: "1" },
        { id: 3, name: "rainbow-3", rate: "1%", star: "3", isPrincess: "1" },
      ];

      let allSilverRuns = 0;
      for (let i = 0; i < 40; i++) {
        playCalls = 0;
        const { rareCount } = budgetedService.drawRewards(skewed, 10, opts);
        if (rareCount[1] === 10) allSilverRuns++;
      }

      // 保底被拿掉（只抽一次不重抽）時，期望 ≈ 40 × 0.9 ≈ 36 次全 1★。
      // 門檻放寬到 25 以免這個機率性斷言變 flaky。
      expect(allSilverRuns).toBeLessThan(25);
    });

    it("保底條件跟著 times 走，不是寫死的 10", () => {
      // 原本的條件是 `rareCount[1] === 10`，times !== 10 時保底永遠不觸發。
      // 純 1★ 池 + times=3：條件現在會成立並重抽到上限，仍然必須收斂且長度正確。
      const { rewards, rareCount } = budgetedService.drawRewards(onlySilver, 3, opts);
      expect(rewards).toHaveLength(3);
      expect(rareCount[1]).toBe(3);
      expect(playCalls).toBeLessThanOrEqual(budgetedService.MAX_PITY_REDRAWS);
      // 寫死 10 的版本在這裡只會抽一次就跳出；用 times 的版本會重抽到上限。
      expect(playCalls).toBeGreaterThan(1);
    });
  });
});
