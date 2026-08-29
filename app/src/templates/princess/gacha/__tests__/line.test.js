// 每日一抽卡片（genDailyGacha / generateDailyGachaInfo）。
// 重複角色從「發女神石」換成「發角色專屬碎片」之後，這張卡的資訊區整段重寫過，
// 這支就是那次改動的迴歸網。
const { generateDailyGachaInfo } = require("../line");

/**
 * 遞迴收集所有 `text` 值，用來斷言「畫面上看得到什麼字」。
 * Flex 的文字散在 text 節點與 span 節點兩層，只看 contents[0] 會漏。
 */
function collect(node, key, acc = []) {
  if (Array.isArray(node)) node.forEach(n => collect(n, key, acc));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === "string") acc.push(v);
      collect(v, key, acc);
    }
  return acc;
}

function visibleText(bubble) {
  return collect(bubble, "text").join("");
}

/**
 * 遍歷整個 bubble，回傳所有「宣告了 contents 卻是空陣列」的節點。
 * LINE 會直接拒收 `contents: []`，所以這必須恆為空。
 */
function emptyContentNodes(node, acc = []) {
  if (Array.isArray(node)) node.forEach(n => emptyContentNodes(n, acc));
  else if (node && typeof node === "object") {
    // box 的 contents 可以是空的（用來畫進度條），text 的不行。
    if (Array.isArray(node.contents) && node.contents.length === 0 && node.type === "text") {
      acc.push(node);
    }
    Object.values(node).forEach(v => emptyContentNodes(v, acc));
  }
  return acc;
}

const baseInfo = {
  newCharacters: [],
  collectedCount: 120,
  allCount: 200,
  fragmentRewards: [],
  costGodStone: 0,
};

describe("每日一抽卡片：碎片顯示", () => {
  it("多個角色各自列出片數，不會加總成單一數字", () => {
    const bubble = generateDailyGachaInfo({
      ...baseInfo,
      fragmentRewards: [
        { itemId: 3, name: "可可蘿", amount: 50 },
        { itemId: 1, name: "佩可莉ーヌ", amount: 10 },
        { itemId: 2, name: "凱留", amount: 3 },
      ],
    });

    const text = visibleText(bubble);
    // 每一隻都要看得到自己的片數；加總成 63 的話玩家不知道該去湊哪一隻
    expect(text).toContain("可可蘿 ×50");
    expect(text).toContain("佩可莉ーヌ ×10");
    expect(text).toContain("凱留 ×3");
    expect(text).not.toContain("×63");
  });

  it("不再出現「獲得女神石」（重複角色已改發碎片）", () => {
    const bubble = generateDailyGachaInfo({
      ...baseInfo,
      fragmentRewards: [{ itemId: 1, name: "佩可莉ーヌ", amount: 10 }],
    });

    const text = visibleText(bubble);
    expect(text).not.toContain("獲得女神石");
    expect(text).toContain("碎片：");
  });

  it("無碎片時顯示「碎片：無」而不是省略整個區塊", () => {
    const bubble = generateDailyGachaInfo({ ...baseInfo, fragmentRewards: [] });

    const text = visibleText(bubble);
    // overlay 是 position:absolute，行數變動會讓卡片高度跳動
    expect(text).toContain("碎片：");
    expect(text).toContain("無");
  });

  it("無碎片時 Flex 結構仍合法：沒有任何 text 節點帶空 contents", () => {
    const bubble = generateDailyGachaInfo({ ...baseInfo, fragmentRewards: [] });

    // LINE 會拒收 contents: []，整張訊息發不出去
    expect(emptyContentNodes(bubble)).toEqual([]);
    expect(bubble.type).toBe("bubble");
    expect(bubble.body.type).toBe("box");
  });

  it("fragmentRewards 缺值（舊 caller）不會爆，退回「無」", () => {
    const bubble = generateDailyGachaInfo({
      newCharacters: [],
      collectedCount: 10,
      allCount: 200,
      costGodStone: 0,
    });

    expect(visibleText(bubble)).toContain("碎片：");
    expect(emptyContentNodes(bubble)).toEqual([]);
  });

  it("超過 5 種角色時截斷，並顯示總種類數", () => {
    const fragmentRewards = Array.from({ length: 8 }, (_, i) => ({
      itemId: i + 1,
      name: `角色${i + 1}`,
      amount: 100 - i,
    }));

    const bubble = generateDailyGachaInfo({ ...baseInfo, fragmentRewards });
    const text = visibleText(bubble);

    // 前 5 種列出來（已按 amount 由多至少排序）
    for (let i = 1; i <= 5; i++) expect(text).toContain(`角色${i} ×`);
    // 第 6 種之後不列名字，只報總數
    expect(text).not.toContain("角色6 ×");
    expect(text).not.toContain("角色8 ×");
    expect(text).toContain("等 8 種角色");
  });

  it("剛好 5 種時全部列出，且不顯示「等 N 種」", () => {
    const fragmentRewards = Array.from({ length: 5 }, (_, i) => ({
      itemId: i + 1,
      name: `角色${i + 1}`,
      amount: 10,
    }));

    const text = visibleText(generateDailyGachaInfo({ ...baseInfo, fragmentRewards }));

    for (let i = 1; i <= 5; i++) expect(text).toContain(`角色${i} ×10`);
    expect(text).not.toContain("等 5 種角色");
  });
});

describe("每日一抽卡片：既有欄位不能被碎片改動弄掉", () => {
  it("保留收藏進度（文字與進度條寬度）", () => {
    const bubble = generateDailyGachaInfo({
      ...baseInfo,
      collectedCount: 120,
      allCount: 200,
    });

    const text = visibleText(bubble);
    expect(text).toContain("距離滿收藏");
    expect(text).toContain("120/200");
    // 120/200 = 60%
    expect(JSON.stringify(bubble)).toContain('"width":"60%"');
  });

  it("有花費時顯示消耗女神石", () => {
    const bubble = generateDailyGachaInfo({ ...baseInfo, costGodStone: 1500 });

    expect(visibleText(bubble)).toContain("消耗女神石：1500");
  });

  it("免費抽（costGodStone=0）不顯示消耗列", () => {
    const bubble = generateDailyGachaInfo({ ...baseInfo, costGodStone: 0 });

    expect(visibleText(bubble)).not.toContain("消耗女神石");
  });

  it("新角色名稱仍然列在「新角色：」後面", () => {
    const bubble = generateDailyGachaInfo({
      ...baseInfo,
      newCharacters: [{ name: "佩可莉ーヌ" }, { name: "可可蘿" }],
    });

    const text = visibleText(bubble);
    expect(text).toContain("新角色：");
    expect(text).toContain("佩可莉ーヌ");
    expect(text).toContain("可可蘿");
  });

  it("碎片與新角色同時存在時兩者都在，且碎片排在新角色之後", () => {
    const bubble = generateDailyGachaInfo({
      ...baseInfo,
      newCharacters: [{ name: "新角" }],
      fragmentRewards: [{ itemId: 1, name: "舊角", amount: 10 }],
    });

    const text = visibleText(bubble);
    expect(text.indexOf("新角色：")).toBeLessThan(text.indexOf("碎片："));
    expect(text).toContain("舊角 ×10");
  });

  it("卡片仍是單一 bubble，NEW 標籤保留", () => {
    const bubble = generateDailyGachaInfo(baseInfo);

    expect(bubble.type).toBe("bubble");
    expect(visibleText(bubble)).toContain("NEW");
    expect(visibleText(bubble)).toContain("每日一抽");
  });
});
