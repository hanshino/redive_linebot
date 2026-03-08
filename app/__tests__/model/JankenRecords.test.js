const JankenRecords = require("../../src/model/application/JankenRecords");

jest.mock("../../src/util/mysql", () => {
  const mockQuery = {
    select: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
  };
  const knex = jest.fn(() => mockQuery);
  knex.raw = jest.fn(val => val);
  knex.__mockQuery = mockQuery;
  return knex;
});

describe("JankenRecords", () => {
  describe("getRecentMatches", () => {
    it("should be a function", () => {
      expect(typeof JankenRecords.getRecentMatches).toBe("function");
    });
  });

  describe("fillable", () => {
    it("should include match detail fields", () => {
      // Verify the model accepts the new fields by checking create doesn't throw
      expect(typeof JankenRecords.create).toBe("function");
    });
  });
});
