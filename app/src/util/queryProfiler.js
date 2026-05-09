const { AsyncLocalStorage } = require("async_hooks");
const { performance } = require("perf_hooks");
const { DefaultLogger } = require("./Logger");

const ENABLED = process.env.QUERY_LOG === "1";
const VERBOSE = process.env.QUERY_LOG_VERBOSE === "1";
const MIN_COUNT = Number(process.env.QUERY_LOG_MIN_COUNT || 1);
const MIN_TOTAL_MS = Number(process.env.QUERY_LOG_MIN_TOTAL_MS || 0);
const TOP_N = Number(process.env.QUERY_LOG_TOP_N || 5);

const als = new AsyncLocalStorage();
const ATTACHED = Symbol("queryProfiler.attached");

function attach(knex) {
  if (!ENABLED || knex[ATTACHED]) return;
  knex[ATTACHED] = true;

  knex.on("query", q => {
    const store = als.getStore();
    if (!store) return;
    store.pending.set(q.__knexQueryUid, {
      sql: q.sql,
      start: performance.now(),
    });
  });

  knex.on("query-response", (_response, q) => finish(q, false));
  knex.on("query-error", (_err, q) => finish(q, true));
}

function finish(q, errored) {
  const store = als.getStore();
  if (!store) return;
  const uid = q && q.__knexQueryUid;
  const pending = store.pending.get(uid);
  if (!pending) return;
  store.pending.delete(uid);
  const dur = performance.now() - pending.start;
  store.completed.push({ sql: pending.sql, dur, errored });
  if (VERBOSE) {
    DefaultLogger.info(
      `[query] +${dur.toFixed(0)}ms ${errored ? "[ERR] " : ""}${shortSql(pending.sql)}`
    );
  }
}

function run(fn) {
  if (!ENABLED) return fn();
  return als.run({ pending: new Map(), completed: [] }, fn);
}

function emitSummary(label) {
  if (!ENABLED) return;
  const store = als.getStore();
  if (!store) return;
  const queries = store.completed;
  const count = queries.length;
  if (count < MIN_COUNT) return;

  const total = queries.reduce((s, q) => s + q.dur, 0);
  if (total < MIN_TOTAL_MS) return;

  const fpCounts = new Map();
  for (const q of queries) {
    const fp = fingerprint(q.sql);
    fpCounts.set(fp, (fpCounts.get(fp) || 0) + 1);
  }
  const dups = [...fpCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([fp, n]) => `${shortSql(fp, 60)}×${n}`)
    .join(" | ");

  const top = queries
    .slice()
    .sort((a, b) => b.dur - a.dur)
    .slice(0, TOP_N)
    .map(q => `  ${q.dur.toFixed(0).padStart(4)}ms ${shortSql(q.sql, 100)}`)
    .join("\n");

  DefaultLogger.info(
    `[query] event=${label} count=${count} db=${total.toFixed(0)}ms` +
      (dups ? ` | dups: ${dups}` : "") +
      `\n${top}`
  );
}

function shortSql(sql, n = 120) {
  const s = String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fingerprint(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .replace(/\b\d+\b/g, "?")
    .trim();
}

module.exports = { attach, run, emitSummary, als, ENABLED };
