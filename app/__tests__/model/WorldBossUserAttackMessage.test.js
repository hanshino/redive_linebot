// jest.mock is NOT hoisted (transform:{}) — declare BEFORE requiring the model.
jest.mock("../../src/util/mysql", () => {
  const qb = {
    select: jest.fn(),
    from: jest.fn(),
    join: jest.fn(),
    leftJoin: jest.fn(),
    groupBy: jest.fn(),
    raw: jest.fn(sql => ({ __raw: sql })),
  };
  // All chain methods return qb explicitly (mockReturnThis would return the
  // wrong `this` when called as knex.select(...) — `this` is knex, not qb).
  qb.select.mockReturnValue(qb);
  qb.from.mockReturnValue(qb);
  qb.join.mockReturnValue(qb);
  qb.leftJoin.mockReturnValue(qb);
  // groupBy is the terminal — resolves with the stub result array.
  qb.groupBy.mockResolvedValue([
    { id: 1, template: "t1", tag: "a" },
    { id: 2, template: "t2", tag: null },
  ]);
  const knex = jest.fn(() => qb);
  // Model uses the standalone form: mysql.select(...).from(TABLE)...
  knex.select = qb.select;
  knex.raw = qb.raw;
  knex.__qb = qb;
  return knex;
});

const mysql = require("../../src/util/mysql");
const model = require("../../src/model/application/WorldBossUserAttackMessage");

describe("WorldBossUserAttackMessage.all (D28: LEFT JOIN + ONLY_FULL_GROUP_BY-safe dedup)", () => {
  beforeEach(() => {
    Object.values(mysql.__qb).forEach(fn => fn.mockClear && fn.mockClear());
  });

  it("uses LEFT JOIN, never an INNER join, so untagged messages survive", async () => {
    await model.all();
    expect(mysql.__qb.leftJoin).toHaveBeenCalledTimes(1);
    expect(mysql.__qb.join).not.toHaveBeenCalled();
  });

  it("groups by the message id so a multi-tag message is not duplicated", async () => {
    await model.all();
    expect(mysql.__qb.groupBy).toHaveBeenCalledWith("world_boss_user_attack_message.id");
  });

  it("does not select('*') (ONLY_FULL_GROUP_BY would reject it); aggregates tag via raw", async () => {
    await model.all();
    // select is called with explicit columns, not the bare "*"
    const selectArgs = mysql.__qb.select.mock.calls.flat();
    expect(selectArgs).not.toContain("*");
    // tag is aggregated through a raw MAX(...) expression
    expect(mysql.__qb.raw).toHaveBeenCalled();
    const rawSql = mysql.__qb.raw.mock.calls.map(c => String(c[0])).join(" ");
    expect(rawSql.toLowerCase()).toContain("max");
  });

  it("returns one row per message including the untagged (tag=null) one", async () => {
    const rows = await model.all();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.id)).toEqual([1, 2]);
  });
});
