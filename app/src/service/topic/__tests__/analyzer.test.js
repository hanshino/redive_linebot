const { createAnalyzer, loadStopwords } = require("../analyzer");
const seed = require("../dictionary.seed");

// Small injected dictionary so each behavior is asserted in isolation, independent
// of whatever the bundled seed/stopword files happen to contain.
const testAliases = {
  凱留: ["黑貓", "臭鼬"],
  賽馬: ["蘭德索爾盃"],
};
const testSlang = ["課金", "笑死"];
const testStopwords = ["然後", "覺得"];

function makeAnalyzer() {
  return createAnalyzer({
    aliases: testAliases,
    slang: testSlang,
    stopwords: testStopwords,
  });
}

describe("topic analyzer", () => {
  it("keeps slang/game terms whole instead of shredding into single chars", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("我今天課金了很多錢");
    expect(out).toContain("課金");
    expect(out).not.toContain("課");
    expect(out).not.toContain("金");
  });

  it("keeps 蘭德索爾盃 whole and normalizes it to its canonical 賽馬", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("今天蘭德索爾盃開跑了");
    expect(out).toContain("賽馬");
    expect(out).not.toContain("蘭德索爾盃");
  });

  it("normalizes multiple surfaces (黑貓, 臭鼬) to the same canonical 凱留", () => {
    const analyzer = makeAnalyzer();
    expect(analyzer.extract("我抽到黑貓了")).toContain("凱留");
    expect(analyzer.extract("我抽到臭鼬了")).toContain("凱留");
  });

  it("keeps a single char when it is the whole message (lone utterance)", () => {
    const analyzer = makeAnalyzer();
    expect(analyzer.extract("哦")).toEqual(["哦"]);
    // Punctuation / emoji around the lone char don't disqualify it.
    expect(analyzer.extract("讚！！")).toEqual(["讚"]);
  });

  it("still drops single-char tokens inside a sentence", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("哦，我知道啊！");
    expect(out).not.toContain("哦");
    expect(out).not.toContain("啊");
  });

  it("drops a lone single char that is a stopword", () => {
    const analyzer = createAnalyzer({ stopwords: ["哦"] });
    expect(analyzer.extract("哦")).toEqual([]);
  });

  it("drops non-Han tokens (fancy unicode, latin, numbers)", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("𝕃𝕠𝕝𝕚 hello 123");
    expect(out).not.toContain("𝕃𝕠𝕝𝕚");
    expect(out).not.toContain("hello");
    expect(out).not.toContain("123");
    expect(out).toEqual([]);
  });

  it("drops stopwords", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("然後我覺得課金");
    expect(out).not.toContain("然後");
    expect(out).not.toContain("覺得");
    expect(out).toContain("課金");
  });

  it("counts a repeated keyword in one message only once (uniqueness)", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("課金課金課金");
    expect(out.filter(t => t === "課金")).toHaveLength(1);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    const analyzer = makeAnalyzer();
    expect(analyzer.extract("")).toEqual([]);
    expect(analyzer.extract("   ")).toEqual([]);
    expect(analyzer.extract("\t\n")).toEqual([]);
  });

  it("strips URLs before tokenizing (no latin/url fragments leak in)", () => {
    const analyzer = makeAnalyzer();
    const out = analyzer.extract("看這個連結 https://example.com/page?a=1 很有趣");
    expect(out).toContain("有趣");
    expect(out).not.toContain("example");
    expect(out).not.toContain("com");
    expect(out).not.toContain("https");
  });

  it("works with the real bundled seed dictionary and stopword list", () => {
    const analyzer = createAnalyzer({
      aliases: seed.aliases,
      slang: seed.slang,
      stopwords: loadStopwords(),
    });
    // 蘭德索爾盃 -> 賽馬 comes from the seed aliases.
    expect(analyzer.extract("蘭德索爾盃要開了")).toContain("賽馬");
    // 課金 is real slang in the seed and should survive whole.
    expect(analyzer.extract("這次活動我課金了")).toContain("課金");
    // A common filler word from the bundled stopword list should be removed.
    expect(analyzer.extract("然後我課金")).not.toContain("然後");
  });
});
