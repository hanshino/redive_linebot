const ChatUserData = require("../../../src/model/application/ChatUserData");
const mysql = require("../../../src/util/mysql");
const migration = require("../../../migrations/20260925172233_add_final_max_level_reached_at");

afterEach(() => jest.clearAllMocks());

test("reads all user fields and locks only when a transaction is supplied", async () => {
  const row = {
    prestige_count: 5,
    final_max_level_reached_at: null,
    final_max_level_legacy_order: 1,
  };
  mysql.first.mockResolvedValue(row);
  expect(await ChatUserData.findByUserId("Ua")).toBe(row);
  expect(mysql.forUpdate).not.toHaveBeenCalled();
  expect(mysql.first).toHaveBeenCalledWith(); // no projection dropping the new field
  expect(await ChatUserData.findByUserId("Ua", mysql)).toBe(row);
  expect(mysql.forUpdate).toHaveBeenCalledTimes(1);
  expect(ChatUserData.model.fillable).toContain("final_max_level_reached_at");
  expect(ChatUserData.model.fillable).toContain("final_max_level_legacy_order");
});

test("model create retains an explicit legacy order without inventing a timestamp", async () => {
  await ChatUserData.model.create({ user_id: "Ua", final_max_level_legacy_order: 1 });
  expect(mysql.insert).toHaveBeenCalledWith({ user_id: "Ua", final_max_level_legacy_order: 1 });
});

test("upsert reads and writes through the supplied transaction, not the global connection", async () => {
  const qb = {
    where: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ user_id: "Ua" }),
    update: jest.fn().mockResolvedValue(1),
    insert: jest.fn().mockResolvedValue([1]),
  };
  const trx = jest.fn(() => qb);
  const updates = { current_exp: 130000, final_max_level_reached_at: new Date(1700000000123) };
  await ChatUserData.upsert("Ua", updates, trx);
  expect(qb.forUpdate).toHaveBeenCalledTimes(1);
  expect(qb.update).toHaveBeenCalledWith(updates);
  expect(mysql).not.toHaveBeenCalled();
  qb.first.mockResolvedValue(null);
  await ChatUserData.upsert("Ub", { current_exp: 90 }, trx);
  expect(qb.insert).toHaveBeenCalledWith({ user_id: "Ub", current_exp: 90 });
});

test("migration adds nullable timestamp and unsigned legacy order without backfill, and drops both", async () => {
  // Compile only: no connection config, migration runner, or database access.
  const knex = require("knex")({ client: "mysql2" });
  try {
    const up = migration
      .up(knex)
      .toSQL()
      .map(q => q.sql);
    expect(up).toEqual([
      "alter table `chat_user_data` add `final_max_level_reached_at` timestamp(3) null, add `final_max_level_legacy_order` int unsigned null",
    ]);
    expect(
      migration
        .down(knex)
        .toSQL()
        .map(q => q.sql)
    ).toEqual([
      "alter table `chat_user_data` drop `final_max_level_reached_at`, drop `final_max_level_legacy_order`",
    ]);
  } finally {
    await knex.destroy();
  }
});
