// Keyword-analysis module for the "chat word cloud" feature.
//
// Pure keyword extraction only: cut -> keep-filter -> normalize -> unique.
// It deliberately does NOT handle command-prefix skipping, media placeholders,
// or min-message-length — that belongs to the ingest layer (a later milestone).
//
// Pipeline validated in poc/topic-wordcloud (line-cloud.js on 13MB of real data).

const fs = require("fs");
const path = require("path");
const { Jieba } = require("@node-rs/jieba");

const HAN_RE = /\p{Script=Han}/u;
const URL_RE = /https?:\/\/\S+/g;
const STOPWORDS_FILE = path.join(__dirname, "stopwords.zh-tw.txt");
// Taiwan-Mandarin base dictionary (vendored from APCLab/jieba-tw, MIT). The
// dict bundled with @node-rs/jieba is Simplified-Chinese-oriented and shreds
// common zh-TW words into single chars, which the >=2-char filter then drops.
const DICT_FILE = path.join(__dirname, "dict.zh-tw.txt");

// Reads the bundled Traditional-Chinese stopword list as a string[]. The
// analyzer accepts injected stopwords too, so this is just the default source.
function loadStopwords() {
  return fs
    .readFileSync(STOPWORDS_FILE, "utf8")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Builds a keyword analyzer from an injected dictionary.
//
//   aliases:   { canonical: [surface, ...] } — surfaces normalize to canonical.
//   slang:     string[] — words kept whole, with no normalization.
//   stopwords: string[] | Set<string> — tokens to drop.
//
// All alias surfaces + canonicals + slang are loaded into a Jieba user dict so
// multi-char game terms / slang stay intact instead of shattering into chars
// (課金 -> 課/金, 蘭德索爾盃 -> single chars). There is no per-word insert API;
// the only way in is loadDict with a "詞 freq" buffer.
function createAnalyzer({ aliases = {}, slang = [], stopwords = [] } = {}) {
  const stopwordSet = stopwords instanceof Set ? stopwords : new Set(stopwords);

  // surface -> canonical; canonicals also map to themselves.
  const surfaceToCanonical = new Map();
  for (const [canonical, surfaces] of Object.entries(aliases)) {
    surfaceToCanonical.set(canonical, canonical);
    for (const surface of surfaces) surfaceToCanonical.set(surface, canonical);
  }

  const jieba = Jieba.withDict(fs.readFileSync(DICT_FILE));
  const userWords = [...new Set([...surfaceToCanonical.keys(), ...slang])];
  if (userWords.length > 0) {
    const userDict = userWords.map(w => `${w} 1000`).join("\n");
    jieba.loadDict(Buffer.from(userDict, "utf8"));
  }

  // Keep a token only if it is >= 2 chars, contains a Han char, and is not a
  // stopword. The Han check is essential: fancy unicode letters like 𝕃𝕠 are
  // surrogate pairs (JS .length === 2), so a length check alone won't drop them.
  function keep(tok) {
    if (tok.length < 2) return false;
    if (!HAN_RE.test(tok)) return false;
    if (stopwordSet.has(tok)) return false;
    return true;
  }

  // extract(text) -> string[] of unique normalized keywords (order preserved).
  function extract(text) {
    if (!text || !text.trim()) return [];
    const clean = text.replace(URL_RE, " ");

    // 整句只講一個字（「哦」「讚！！」）→ 收那個字。單字混在句子裡
    // （「哦，我知道啊！」）仍被 keep() 的 >=2 字規則擋掉；這裡只放行
    // 「那個字本身就是完整發言」的情境。以漢字數判斷，標點/emoji 不算。
    const bare = [...clean.replace(/[^\p{Script=Han}]/gu, "")];
    if (bare.length === 1 && !stopwordSet.has(bare[0])) {
      return [surfaceToCanonical.get(bare[0]) || bare[0]];
    }

    const seen = new Set();
    for (let tok of jieba.cut(clean)) {
      tok = tok.trim();
      if (!keep(tok)) continue;
      seen.add(surfaceToCanonical.get(tok) || tok);
    }
    return [...seen];
  }

  return { extract };
}

module.exports = { createAnalyzer, loadStopwords };
