// Regression guard for the transaction-scoping fix.
// Before the fix, models were process-level singletons that stored the active
// transaction on `this.trx` (via setTransaction/transaction()), so a concurrent
// request could run inside another request's open transaction. The fix makes the
// transaction a per-call parameter (`qb(trx)`) with no shared state.
//
// jest.mock is NOT hoisted here (app jest config uses transform:{}), so the mock
// must precede the require.
jest.mock("../../src/util/mysql", () => {
  const makeBuilder = () => ({
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    first: jest.fn().mockReturnThis(),
  });
  return jest.fn(() => makeBuilder());
});

const mysql = require("../../src/util/mysql");
const Base = require("../../src/model/base");

describe("base model transaction scoping", () => {
  let model;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new Base({ table: "widgets", fillable: ["a", "b"] });
  });

  it("routes to the global connection when no trx is passed", async () => {
    await model.create({ a: 1, b: 2 });
    expect(mysql).toHaveBeenCalledWith("widgets");
  });

  it("routes to the passed trx and never touches the global connection", async () => {
    const trxBuilder = { insert: jest.fn().mockResolvedValue([9]) };
    const trx = jest.fn(() => trxBuilder);

    await model.create({ a: 1, b: 2 }, trx);

    expect(trx).toHaveBeenCalledWith("widgets");
    expect(trxBuilder.insert).toHaveBeenCalledTimes(1);
    // the regression: a transactional write must not leak onto the global connection
    expect(mysql).not.toHaveBeenCalled();
  });

  it("keeps no cross-call transaction state (the singleton leak is structurally gone)", async () => {
    const trxA = jest.fn(() => ({ insert: jest.fn().mockResolvedValue([1]) }));
    const trxB = jest.fn(() => ({ insert: jest.fn().mockResolvedValue([2]) }));

    // two interleaved "requests" on the SAME singleton, each with its own trx
    await Promise.all([model.create({ a: 1 }, trxA), model.create({ a: 2 }, trxB)]);

    expect(trxA).toHaveBeenCalledWith("widgets");
    expect(trxB).toHaveBeenCalledWith("widgets");
    expect(mysql).not.toHaveBeenCalled();

    // the footgun API is gone for good
    expect(model.setTransaction).toBeUndefined();
    expect(model.transaction).toBeUndefined();
    expect(model.trx).toBeUndefined();
  });
});

describe("base model filter conditions", () => {
  let model;

  beforeEach(() => {
    jest.clearAllMocks();
    model = new Base({ table: "widgets", fillable: [] });
  });

  it("keeps qualified operator filters scalar in all() and first()", () => {
    model.all({ filter: { "subscribe_user.start_at": { operator: "<=", value: 10 } } });
    expect(mysql.mock.results[0].value.where).toHaveBeenCalledWith(
      "subscribe_user.start_at",
      "<=",
      10
    );

    model.first({ filter: { "subscribe_user.end_at": { operator: ">", value: 20 } } });
    expect(mysql.mock.results[1].value.where).toHaveBeenCalledWith(
      "subscribe_user.end_at",
      ">",
      20
    );
  });

  it("keeps unqualified operators and plain, Date, and null values unchanged", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    model.all({
      filter: {
        level: { operator: ">=", value: 10 },
        user_id: "U123",
        created_at: date,
        deleted_at: null,
      },
    });

    expect(mysql.mock.results[0].value.where.mock.calls).toEqual([
      ["level", ">=", 10],
      ["user_id", "=", "U123"],
      ["created_at", "=", date],
      ["deleted_at", "=", null],
    ]);
  });
});
