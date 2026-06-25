// Default keyword dictionary seed for the topic word-cloud analyzer.
//
// Ported from poc/topic-wordcloud (aliases.json + slang.txt). It makes the
// analyzer usable before the DB-backed dictionary exists. Once the topic_keyword
// table lands (a later milestone), entries loaded from the DB will augment or
// replace this static seed — keep it small and only for bootstrap coverage.

// canonical -> [surface, ...]; surfaces normalize to the canonical keyword.
const aliases = {
  凱留: ["黑貓", "臭鼬"],
  可可蘿: ["可蘿", "媽媽"],
  世界王: ["世王"],
  賽馬: ["蘭德索爾盃"],
  猜拳: ["剪刀石頭布"],
};

// Slang / colloquial / game terms jieba's standard dict doesn't know and would
// otherwise shred into single chars (笑死 -> 笑/死). No normalization applied.
const slang = [
  "笑死",
  "爆死",
  "課金",
  "課爆",
  "好可愛",
  "補師",
  "復刻",
  "無底洞",
  "天下第一",
  "心痛",
  "下注",
  "攻略",
  "血量",
  "生日快樂",
  "大佬",
];

module.exports = { aliases, slang };
