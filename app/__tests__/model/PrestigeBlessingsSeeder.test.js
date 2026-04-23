jest.mock("../../src/util/mysql", () => jest.fn());

describe("PrestigeBlessingsSeeder", () => {
  const Seeder = require("../../seeds/PrestigeBlessingsSeeder");

  it("produces exactly 7 blessings with ids 1-7", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(7);
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("has expected slugs", () => {
    const rows = Seeder.buildRows();
    expect(rows.map(r => r.slug)).toEqual([
      "language_gift",
      "swift_tongue",
      "ember_afterglow",
      "whispering",
      "rhythm_spring",
      "star_guard",
      "greenhouse",
    ]);
  });

  it("encodes effect_meta as JSON string per spec", () => {
    const rows = Seeder.buildRows();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(JSON.parse(byId[1].effect_meta)).toEqual({
      type: "per_msg_xp_multiplier",
      value: 0.08,
    });
    expect(JSON.parse(byId[2].effect_meta)).toEqual({
      type: "cooldown_threshold_shift",
      from: 6,
      to: 5,
    });
    expect(JSON.parse(byId[3].effect_meta)).toEqual({
      type: "cooldown_tier_override",
      tiers: { "0-1": 0.1, "1-2": 0.3 },
    });
    expect(JSON.parse(byId[4].effect_meta)).toEqual({
      type: "diminish_tier_expand",
      tier: "0-200",
      to: 300,
    });
    expect(JSON.parse(byId[5].effect_meta)).toEqual({
      type: "diminish_tier_expand",
      tier: "200-500",
      to: 600,
    });
    expect(JSON.parse(byId[6].effect_meta)).toEqual({
      type: "group_bonus_slope",
      value: 0.025,
    });
    expect(JSON.parse(byId[7].effect_meta)).toEqual({
      type: "small_group_multiplier",
      threshold: 10,
      value: 1.3,
    });
  });
});
