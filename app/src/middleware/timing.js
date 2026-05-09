const { AsyncLocalStorage } = require("async_hooks");
const { performance } = require("perf_hooks");
const { DefaultLogger } = require("../util/Logger");
const queryProfiler = require("../util/queryProfiler");

const ENABLED = process.env.TIMING_DISABLED !== "1";
const SLOW_STAGE_MS = Number(process.env.TIMING_SLOW_STAGE_MS || 50);
// 與 SLOW_STAGE_MS 對齊：任何 stage 觸發時，總時間 breakdown 也會印出。
const SLOW_TOTAL_MS = Number(process.env.TIMING_SLOW_TOTAL_MS || 50);
// LINE reply 在群組通常 50–150ms，超過此閾值代表 LINE 端疑似有延遲。
const SLOW_API_MS = Number(process.env.TIMING_SLOW_API_MS || 100);
const STAGE_REPORT_THRESHOLD_MS = 5;

const timingMap = new WeakMap();
const timingAls = new AsyncLocalStorage();
const PATCHED = Symbol("timing.patched");

function getEventLabel(context) {
  try {
    const ev = context.event;
    if (ev.isText) return `text:${(ev.text || "").slice(0, 24)}`;
    if (ev.isPayload) {
      try {
        const action = JSON.parse(ev.payload).action;
        return `postback:${action || "?"}`;
      } catch {
        return "postback";
      }
    }
    return (ev._rawEvent && ev._rawEvent.type) || "event";
  } catch {
    return "event";
  }
}

function ensureEntry(context) {
  let entry = timingMap.get(context);
  if (!entry) {
    entry = {
      start: performance.now(),
      stages: [],
      steps: [],
      label: getEventLabel(context),
    };
    timingMap.set(context, entry);
  }
  return entry;
}

function withTiming(name, mw) {
  if (!ENABLED) return mw;
  return async (context, props) => {
    const entry = ensureEntry(context);
    const start = performance.now();
    try {
      return await mw(context, props);
    } finally {
      const dur = performance.now() - start;
      entry.stages.push([name, dur]);
      if (dur >= SLOW_STAGE_MS) {
        DefaultLogger.info(
          `[timing] stage=${name} dur=${dur.toFixed(1)}ms event=${getEventLabel(context)}`
        );
      }
    }
  };
}

/**
 * 在 chain stage 內部對更細的 await 段落計時。
 * 與 withTiming 不同：steps 不參與 unaccounted 計算（避免巢狀重複），
 * 純粹做為 breakdown 輔助線。
 *
 * @param {string} label
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
async function time(label, fn) {
  if (!ENABLED) return fn();
  const store = timingAls.getStore();
  const entry = store && store.entry;
  if (!entry) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const dur = performance.now() - start;
    entry.steps.push([label, dur]);
    if (dur >= SLOW_STAGE_MS) {
      DefaultLogger.info(`[timing] step=${label} dur=${dur.toFixed(1)}ms event=${entry.label}`);
    }
  }
}

function wrapChain(chainAction) {
  if (!ENABLED && !queryProfiler.ENABLED) return chainAction;
  return async (context, props) => {
    const body = async () => {
      const entry = ENABLED ? ensureEntry(context) : null;
      if (ENABLED && context && context.client) patchLineClient(context.client);
      const runChain = async () => {
        try {
          // Bottender's `chain()` is a builder, not a runner: it returns the
          // first bound action and Bot.run drives the dialog loop. Replicate
          // that loop here so this finally observes the real total.
          let nextDialog = await chainAction(context, props);
          while (typeof nextDialog === "function") {
            nextDialog = await nextDialog(context, {});
          }
          return nextDialog;
        } finally {
          const label = getEventLabel(context);
          if (ENABLED && entry) {
            const total = performance.now() - entry.start;
            const stagesSum = entry.stages.reduce((sum, [, d]) => sum + d, 0);
            const unaccounted = total - stagesSum;
            if (total >= SLOW_TOTAL_MS) {
              const breakdown = entry.stages
                .filter(([, d]) => d >= STAGE_REPORT_THRESHOLD_MS)
                .map(([n, d]) => `${n}=${d.toFixed(0)}`)
                .join(" ");
              const stepsBreakdown =
                entry.steps.length > 0
                  ? " | steps: " +
                    entry.steps
                      .filter(([, d]) => d >= STAGE_REPORT_THRESHOLD_MS)
                      .map(([n, d]) => `${n}=${d.toFixed(0)}`)
                      .join(" ")
                  : "";
              DefaultLogger.info(
                `[timing] total=${total.toFixed(0)}ms unaccounted=${unaccounted.toFixed(0)}ms event=${label} | ${breakdown}${stepsBreakdown}`
              );
            }
          }
          queryProfiler.emitSummary(label);
        }
      };
      return ENABLED && entry ? timingAls.run({ entry }, runChain) : runChain();
    };
    return queryProfiler.ENABLED ? queryProfiler.run(body) : body();
  };
}

function patchLineClient(client) {
  if (!ENABLED || !client || client[PATCHED]) return;
  client[PATCHED] = true;

  const wrap = methodName => {
    const original = client[methodName];
    if (typeof original !== "function") return;
    client[methodName] = async function (...args) {
      const start = performance.now();
      try {
        return await original.apply(this, args);
      } finally {
        const dur = performance.now() - start;
        if (dur >= SLOW_API_MS) {
          DefaultLogger.info(`[timing] line-api=${methodName} dur=${dur.toFixed(0)}ms`);
        }
      }
    };
  };

  ["replyMessage", "pushMessage", "multicast", "broadcast"].forEach(wrap);
}

module.exports = { withTiming, wrapChain, patchLineClient, time };
