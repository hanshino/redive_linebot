const assert = require("assert");
const { toPublic, toPublicList } = require("../achievementPublicView");

const achievement = {
  id: 1,
  name: "秘密成就",
  description: "累計抽卡 500 次",
  condition: "secret",
  isUnlocked: true,
};

test("achievement descriptions are included only for explicitly unlocked views", () => {
  assert.strictEqual(
    toPublic(achievement, { includeDescription: true }).description,
    achievement.description
  );
  assert.ok(!Object.hasOwn(toPublic({ ...achievement, isUnlocked: false }), "description"));
  assert.ok(!Object.hasOwn(toPublic({ ...achievement, isUnlocked: undefined }), "description"));
  assert.ok(!Object.hasOwn(toPublicList([{ ...achievement }])[0], "description"));
  assert.ok(
    !Object.hasOwn(
      toPublicList([{ ...achievement }], { includeDescription: false })[0],
      "description"
    )
  );
  assert.strictEqual(
    toPublicList([achievement], { includeDescription: true })[0].description,
    achievement.description
  );
});
