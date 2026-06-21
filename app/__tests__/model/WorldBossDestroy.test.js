// jest.mock is NOT hoisted (transform:{}) — declare BEFORE requiring the model.
// Real chain (verified WorldBoss.js:62-64): mysql(TABLE).delete().where({ id })
//   -> .delete() returns the builder, .where() resolves to the affected-row count.
jest.mock("../../src/util/mysql", () => {
  const qb = {
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(1),
  };
  const knex = jest.fn(() => qb);
  knex.__qb = qb;
  return knex;
});

const mysql = require("../../src/util/mysql");
const WorldBoss = require("../../src/model/application/WorldBoss");

describe("WorldBoss model — destroy (renamed from destory)", () => {
  beforeEach(() => {
    mysql.__qb.delete.mockClear();
    mysql.__qb.where.mockClear();
  });

  it("exposes destroy() and no longer exposes the misspelled destory()", () => {
    expect(typeof WorldBoss.destroy).toBe("function");
    expect(WorldBoss.destory).toBeUndefined();
  });

  it("destroy(id) issues a delete scoped to that id (chain order .delete().where)", async () => {
    const result = await WorldBoss.destroy(7);
    expect(mysql).toHaveBeenCalledWith("world_boss");
    expect(mysql.__qb.delete).toHaveBeenCalledTimes(1);
    expect(mysql.__qb.where).toHaveBeenCalledWith({ id: 7 });
    expect(result).toBe(1);
  });
});
