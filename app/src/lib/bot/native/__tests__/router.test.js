const native = require("../router");
const { LineEvent } = require("../context");

function context(text = "Hello") {
  return {
    platform: "line",
    event: new LineEvent(
      text === null ? { type: "follow" } : { type: "message", message: { type: "text", text } }
    ),
  };
}

// Fixed expectations characterized against the former engine; keep every native scenario.
describe("routing contract", () => {
  const { chain, withProps, router, route, text, line, run } = native;

  test.each([
    ["Hello", "Hello", true],
    ["hello", "Hello", false],
    ["Hello", " Hello ", false],
    ["Hello", "Hello world", false],
    ["*", "", true],
    ["*", null, false],
    ["Hello", null, false],
    [["Hello", "world"], "Hello", true],
    [["Hello"], "hello", false],
    [[/Hello/], "Hello", false],
    [[null], null, true],
    [/Hello/, "Hello", true],
    [/^null$/, null, true],
    [42, "42", false],
    [null, "Hello", false],
  ])("text(%p) on %p matches %p", async (pattern, value, matches) => {
    const action = jest.fn(() => "matched");
    const next = jest.fn(() => "next");
    const ctx = context(value);
    expect(await run(router([text(pattern, action)]), ctx, { next })).toBe(
      matches ? "matched" : "next"
    );
    expect(action).toHaveBeenCalledTimes(matches ? 1 : 0);
    expect(next).toHaveBeenCalledTimes(matches ? 0 : 1);
  });

  test("regex preserves captures, named groups and all exec metadata", async () => {
    const action = jest.fn((_ctx, props) => props);
    const result = await run(
      router([text(/(?<name>Hello) (\d+)/, action)]),
      context("x Hello 42"),
      {
        match: "overridden",
        keep: true,
      }
    );
    expect(result.keep).toBe(true);
    expect([...result.match]).toEqual(["Hello 42", "Hello", "42"]);
    expect(result.match).toMatchObject({
      index: 2,
      input: "x Hello 42",
      groups: { name: "Hello" },
    });
  });

  test.each(["g", "y"])("regex retains lastIndex for /%s", flags => {
    const pattern = new RegExp("Hello", flags);
    const matcher = text(pattern, () => {});
    expect(matcher.predicate(context()).match[0]).toBe("Hello");
    expect(pattern.lastIndex).toBe(5);
    expect(matcher.predicate(context())).toBe(false);
    expect(pattern.lastIndex).toBe(0);
  });

  test("awaits predicates in order, binds without running, merges object match over props", async () => {
    const order = [];
    const action = jest.fn((_ctx, props) => props);
    const ignored = jest.fn();
    const original = { keep: 1, overwrite: "old" };
    const ctx = context();
    const bound = await router([
      route(async received => {
        expect(received).toBe(ctx);
        await Promise.resolve();
        order.push("miss");
        return false;
      }, ignored),
      route(async () => {
        order.push("match");
        return { overwrite: "new", extra: 2 };
      }, action),
      route(ignored, ignored),
    ])(ctx, original);
    expect(order).toEqual(["miss", "match"]);
    expect(action).not.toHaveBeenCalled();
    expect(ignored).not.toHaveBeenCalled();
    expect(await bound(context("different"), { bad: true })).toEqual({
      keep: 1,
      overwrite: "new",
      extra: 2,
    });
    expect(action.mock.calls[0][0]).toBe(ctx);
    expect(original).toEqual({ keep: 1, overwrite: "old" });
  });

  test("route wildcard is unconditional, other strings are not interpreted as patterns", async () => {
    expect(route("*", () => {}).predicate({})).toBe(true);
    expect(route("Hello", () => {}).predicate).toBe("Hello");
    await expect(run(router([route("Hello", () => {})]), context())).rejects.toThrow(TypeError);
    expect(await router([])(context())).toBeUndefined();
  });

  test.each(["message", "follow", "unfollow", "join", "leave", "memberJoined", "memberLeft"])(
    "line.%s checks both platform and live event type",
    type => {
      const ctx = { platform: "line", event: new LineEvent({ type }) };
      const matcher = line[type](() => {});
      expect(matcher.predicate(ctx)).toBe(true);
      expect(matcher.predicate({ ...ctx, platform: "other" })).toBe(false);
      ctx.event._rawEvent.type = "unknown";
      expect(matcher.predicate(ctx)).toBe(false);
    }
  );

  test("line and line.any match any LINE event", () => {
    expect(line.any).toBe(line);
    expect(line(() => {}).predicate({ platform: "line" })).toBe(true);
    expect(line(() => {}).predicate({ platform: "other" })).toBe(false);
  });

  test.each([true, false])("nested router falls through next (inner match=%p)", async matched => {
    const calls = [];
    const outerNext = jest.fn(() => "outer");
    const entry = chain([
      router([
        route(
          "*",
          router([
            text(matched ? "Hello" : "missing", (_ctx, props) => {
              calls.push("inner");
              return props.next;
            }),
          ])
        ),
      ]),
      (_ctx, props) => {
        calls.push(props.label);
        return props.next;
      },
    ]);
    expect(await run(entry, context(), { next: outerNext, label: "last" })).toBe("outer");
    expect(calls).toEqual(matched ? ["inner", "last"] : ["last"]);
    expect(outerNext).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, null, false, 0, "done", { done: true }])(
    "chain stops at terminal %p instead of automatically continuing",
    async terminal => {
      const later = jest.fn();
      const first = jest.fn(() => terminal);
      const entry = chain([first, later]);
      const bound = entry(context());
      expect(first).not.toHaveBeenCalled();
      expect(typeof bound).toBe("function");
      expect(await run(entry, context())).toBe(terminal);
      expect(first).toHaveBeenCalledTimes(1);
      expect(later).not.toHaveBeenCalled();
    }
  );

  test("chain validates input, supports an empty chain, and copies props per action", async () => {
    expect(() => chain(null)).toThrow("Chain stack must be an array!");
    expect(() => chain([null])).toThrow("Chain must be composed of actions!");
    expect(await run(chain([]), context(), { next: () => "unused" })).toBeUndefined();
    const props = { value: 1 };
    expect(
      await run(
        chain([
          (_ctx, p) => {
            p.value = 2;
            return p.next;
          },
          (_ctx, p) => p.value,
        ]),
        context(),
        props
      )
    ).toBe(1);
    expect(props.value).toBe(1);
  });

  test("withProps shallow-freezes the original, preserves name/this/extra arguments, never merges", () => {
    const props = { nested: {} };
    const calls = [];
    function Named(...args) {
      calls.push({ receiver: this, args });
    }
    const action = withProps(Named, props);
    expect(Object.isFrozen(props)).toBe(true);
    expect(Object.isFrozen(props.nested)).toBe(false);
    expect(action.name).toBe("Named");
    const receiver = {};
    const ctx = context();
    const callerProps = { ignored: true };
    action.call(receiver, ctx, callerProps);
    expect(calls).toEqual([{ receiver, args: [ctx, props, callerProps] }]);
    expect(calls[0].args[1]).toBe(props);
    expect(withProps((0, () => {}), {}).name).toBe("Anonymous");
  });

  test("run awaits continuations with fresh empty props and propagates failures", async () => {
    const ctx = context();
    const props = { start: true };
    const seen = [];
    const last = jest.fn((_ctx, p) => {
      seen.push(p);
      return 42;
    });
    const middle = jest.fn((_ctx, p) => {
      seen.push(p);
      return last;
    });
    const first = jest.fn(async () => middle);
    expect(await run(first, ctx, props)).toBe(42);
    expect(first).toHaveBeenCalledWith(ctx, props);
    expect(middle).toHaveBeenCalledWith(ctx, {});
    expect(last).toHaveBeenCalledWith(ctx, {});
    expect(seen[0]).not.toBe(seen[1]);
    const error = new Error("action failed");
    await expect(run(() => () => Promise.reject(error), ctx)).rejects.toBe(error);
    await expect(run(router([route(() => Promise.reject(error), last)]), ctx)).rejects.toBe(error);
    expect(
      await run(
        withProps((_ctx, p) => p.value, { value: 7 }),
        ctx,
        props
      )
    ).toBe(7);
  });
});

test.each(["0", "1"])(
  "native runner coexists with real timing wrapper (disabled=%s)",
  async disabled => {
    const previous = process.env.TIMING_DISABLED;
    process.env.TIMING_DISABLED = disabled;
    let timing;
    jest.isolateModules(() => {
      jest.doMock("../../../../util/queryProfiler", () => ({
        ENABLED: false,
        emitSummary: jest.fn(),
      }));
      timing = require("../../../../middleware/timing");
    });
    try {
      const finish = jest.fn(() => "finished");
      let release;
      const barrier = new Promise(resolve => {
        release = resolve;
      });
      const first = jest.fn(async (_ctx, props) => {
        await barrier;
        return props.next;
      });
      const entry = native.chain([timing.withTiming("first", first), finish]);
      const wrapped = timing.wrapChain(entry);
      expect(wrapped === entry).toBe(disabled === "1");
      const running = native.run(wrapped, context());
      expect(finish).not.toHaveBeenCalled();
      release();
      expect(await running).toBe("finished");
      expect(first).toHaveBeenCalledTimes(1);
      expect(finish).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.TIMING_DISABLED;
      else process.env.TIMING_DISABLED = previous;
      jest.dontMock("../../../../util/queryProfiler");
    }
  }
);
