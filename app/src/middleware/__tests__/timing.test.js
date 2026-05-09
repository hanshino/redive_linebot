// Use the real bottender chain (setup.js stubs it for other suites).
const { chain } = jest.requireActual("bottender");
const { withTiming, wrapChain } = require("../timing");
const { DefaultLogger } = require("../../util/Logger");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeContext() {
  return { event: { isText: true, text: "test" }, client: null };
}

// Faithful copy of bottender Bot.run's dialog driver loop. Bottender's
// `chain()` is a builder, not a runner: it returns the first bound action,
// and Bot.run is what unwraps the dialog chain. Tests must do the same.
async function runDialog(action, context) {
  let next = await action(context, {});
  while (typeof next === "function") {
    next = await next(context, {});
  }
  return next;
}

function getInfoLogs() {
  return DefaultLogger.info.mock.calls.map(args => args[0]);
}

describe("timing middleware", () => {
  beforeEach(() => {
    DefaultLogger.info.mockClear();
  });

  describe("wrapChain", () => {
    it("logs total= after the chain actually finishes (regression: chain is a builder, not a runner)", async () => {
      const ctx = makeContext();
      const wrapped = wrapChain(
        chain([
          withTiming("m1", async (_c, p) => {
            await sleep(80);
            return p.next;
          }),
          withTiming("m2", async (_c, p) => {
            await sleep(60);
            return p.next;
          }),
          () => null,
        ])
      );

      await runDialog(wrapped, ctx);

      const totalLog = getInfoLogs().find(l => l.startsWith("[timing] total="));
      expect(totalLog).toBeDefined();

      const total = Number(totalLog.match(/total=(\d+)ms/)[1]);
      expect(total).toBeGreaterThanOrEqual(120);

      expect(totalLog).toMatch(/m1=\d+/);
      expect(totalLog).toMatch(/m2=\d+/);
    });

    it("propagates the chain's terminal value back to the caller", async () => {
      const ctx = makeContext();
      const sentinel = { done: true };
      const wrapped = wrapChain(
        chain([withTiming("only", async (_c, p) => p.next), () => sentinel])
      );

      const result = await runDialog(wrapped, ctx);
      expect(result).toBe(sentinel);
    });
  });

  describe("withTiming", () => {
    it("logs stage= when a stage exceeds the slow threshold", async () => {
      const ctx = makeContext();
      const slow = withTiming("slow-stage", async () => {
        await sleep(80);
      });

      await slow(ctx, {});

      expect(getInfoLogs().some(l => l.startsWith("[timing] stage=slow-stage"))).toBe(true);
    });
  });
});
