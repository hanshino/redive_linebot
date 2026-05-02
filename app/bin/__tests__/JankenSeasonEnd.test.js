const SeasonEnd = require("../JankenSeasonEnd");

describe("JankenSeasonEnd CLI", () => {
  test("parseArgv parses --note and --enable-rewards", () => {
    const args = SeasonEnd.parseArgv(["--note", "foo bar", "--enable-rewards"]);
    expect(args.note).toBe("foo bar");
    expect(args.enableRewards).toBe(true);
  });
  test("parseArgv defaults: note null, enableRewards false", () => {
    expect(SeasonEnd.parseArgv([])).toEqual({ note: null, enableRewards: false });
  });
});
