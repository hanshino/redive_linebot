describe("PrestigeTrialsSeeder", () => {
  const Seeder = require("../../seeds/PrestigeTrialsSeeder");

  it("produces exactly 5 trials with ids 1-5", () => {
    const rows = Seeder.buildRows();
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("has expected slugs in star order", () => {
    const rows = Seeder.buildRows();
    expect(rows.map(r => r.slug)).toEqual([
      "departure",
      "hardship",
      "rhythm",
      "solitude",
      "awakening",
    ]);
  });

  it("encodes restriction_meta + reward_meta as JSON strings per spec", () => {
    const rows = Seeder.buildRows();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));

    expect(JSON.parse(byId[1].restriction_meta)).toEqual({ type: "none" });
    expect(JSON.parse(byId[1].reward_meta)).toEqual({
      type: "trigger_achievement",
      achievement_slug: "prestige_departure",
    });

    expect(JSON.parse(byId[2].restriction_meta)).toEqual({
      type: "xp_multiplier",
      value: 0.7,
    });
    expect(JSON.parse(byId[2].reward_meta)).toEqual({
      type: "permanent_xp_multiplier",
      value: 0.1,
    });

    expect(JSON.parse(byId[3].restriction_meta)).toEqual({
      type: "cooldown_shift_multiplier",
      value: 1.33,
    });
    expect(JSON.parse(byId[3].reward_meta)).toEqual({
      type: "cooldown_tier_override",
      tiers: { "2-4": 0.7, "4-6": 0.9 },
    });

    expect(JSON.parse(byId[4].restriction_meta)).toEqual({
      type: "group_bonus_disabled",
    });
    expect(JSON.parse(byId[4].reward_meta)).toEqual({ type: "group_bonus_double" });

    expect(JSON.parse(byId[5].restriction_meta)).toEqual({
      type: "xp_multiplier",
      value: 0.5,
    });
    expect(JSON.parse(byId[5].reward_meta)).toEqual({
      type: "permanent_xp_multiplier",
      value: 0.15,
      achievement_slug: "prestige_awakening",
    });
  });

  it("has correct required_exp and star per spec", () => {
    const rows = Seeder.buildRows();
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId[1]).toMatchObject({ star: 1, required_exp: 10000, duration_days: 60 });
    expect(byId[2]).toMatchObject({ star: 2, required_exp: 9000, duration_days: 60 });
    expect(byId[3]).toMatchObject({ star: 3, required_exp: 12500, duration_days: 60 });
    expect(byId[4]).toMatchObject({ star: 4, required_exp: 12500, duration_days: 60 });
    expect(byId[5]).toMatchObject({ star: 5, required_exp: 10000, duration_days: 60 });
  });
});
