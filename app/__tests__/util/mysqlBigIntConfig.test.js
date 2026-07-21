describe("MySQL BIGINT configuration", () => {
  test("preserves unsafe BIGINT as strings while keeping safe BIGINT as numbers", () => {
    jest.isolateModules(() => {
      jest.doMock("knex", () => options => {
        expect(options.connection).toMatchObject({ supportBigNumbers: true });
        expect(options.connection).not.toHaveProperty("bigNumberStrings");
        return {
          client: { config: options },
          destroy: jest.fn(),
        };
      });
      jest.doMock("../../src/util/queryProfiler", () => ({ attach: jest.fn() }));

      require("../../src/util/mysql");
    });
  });

  test("uses the same parsing contract for migrations", () => {
    const config = require("../../knexfile");

    expect(config.connection).toMatchObject({ supportBigNumbers: true });
    expect(config.connection).not.toHaveProperty("bigNumberStrings");
  });
});
