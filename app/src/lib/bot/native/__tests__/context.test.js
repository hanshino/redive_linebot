const { Context, LineContext, LineEvent } = require("../context");
const { chain, router, text, run } = require("../router");
const legacy = jest.requireActual("bottender");

function raw(source = { type: "user", userId: "U1" }) {
  return {
    type: "message",
    timestamp: 123,
    source,
    replyToken: "reply-token",
    message: { type: "text", text: "alias", id: "message-id" },
  };
}

function make(options = {}, engine = "native") {
  const client = {
    reply: jest.fn().mockResolvedValue({ sent: true }),
    getUserProfile: jest.fn().mockResolvedValue({ name: "user" }),
    getGroupMemberProfile: jest.fn().mockResolvedValue({ name: "group" }),
    getRoomMemberProfile: jest.fn().mockResolvedValue({ name: "room" }),
  };
  const logger = { warn: jest.fn(), error: jest.fn() };
  const args = { rawEvent: raw(), initialState: {}, client, logger, ...options };
  if (engine === "native") return new LineContext(args);
  const source = args.rawEvent.source;
  const session = {
    id: `line:${source[`${source.type}Id`]}`,
    type: source.type,
    [source.type]: { id: source[`${source.type}Id`] },
    _state: args.state,
  };
  if (source.userId) session.user = { id: source.userId };
  return new legacy.LineContext({
    client: args.client,
    event: new legacy.LineEvent(args.rawEvent, { destination: args.destination }),
    session,
    initialState: args.initialState,
    shouldBatch: true,
  });
}

describe.each([
  ["native", LineEvent],
  ["bottender", legacy.LineEvent],
])("%s LineEvent contract", (_engine, Event) => {
  test("raw references and all message fields remain live", () => {
    const input = raw();
    input.message.mention = { mentionees: [] };
    input.message.quotedMessageId = "quoted";
    input.message.quoteToken = "quote-token";
    const event = new Event(input, { destination: "bot" });
    expect(event.rawEvent).toBe(input);
    expect(event._rawEvent).toBe(input);
    expect(event.source).toBe(input.source);
    expect(event.message).toBe(input.message);
    expect(event.destination).toBe("bot");
    expect(event.timestamp).toBe(123);
    expect(event.replyToken).toBe("reply-token");
    expect(event.isMessage).toBe(true);
    expect(event.isText).toBe(true);
    expect(event.text).toBe("alias");
    event._rawEvent.message.text = "command";
    event._rawEvent.source = { type: "group", groupId: "C1", userId: "U1", id: 10 };
    event._rawEvent.timestamp = 456;
    expect(event.text).toBe("command");
    expect(event.source).toBe(input.source);
    expect(event.source.id).toBe(10);
    expect(event.timestamp).toBe(456);
    event._rawEvent = { type: "follow" };
    expect(event.rawEvent).not.toBe(input);
    expect(event.isMessage).toBe(false);
    expect(event.isText).toBe(false);
    expect(event.text).toBeNull();
    expect(event.message).toBeNull();
    expect(event.source).toBeNull();
  });

  test("missing token differs from a present undefined token; getters preserve raw nullability", () => {
    const event = new Event({ type: "unknown" });
    expect(event.destination).toBeNull();
    expect(new Event({}, { destination: "" }).destination).toBeNull();
    expect(event.timestamp).toBeUndefined();
    expect(event.replyToken).toBeNull();
    event._rawEvent.replyToken = undefined;
    expect(event.replyToken).toBeUndefined();
    event._rawEvent.replyToken = "";
    expect(event.replyToken).toBe("");
    expect(event.postback).toBeNull();
    expect(event.payload).toBeNull();
    expect(event.memberJoined).toBeNull();
    expect(event.memberLeft).toBeNull();
  });

  test("payload is unparsed text; postback getter is not gated by event type", () => {
    const event = new Event({ type: "postback", postback: { data: '{"action":"run"}' } });
    expect(event.isPostback).toBe(true);
    expect(event.isPayload).toBe(true);
    expect(event.payload).toBe('{"action":"run"}');
    expect(event.postback).toBe(event.rawEvent.postback);
    event._rawEvent.postback.data = "not JSON";
    expect(event.payload).toBe("not JSON");
    event._rawEvent.type = "other";
    expect(event.postback.data).toBe("not JSON");
    expect(event.isPostback).toBe(false);
    expect(event.isPayload).toBe(false);
    expect(event.payload).toBeNull();
  });

  test.each(["follow", "unfollow", "join", "leave", "memberJoined", "memberLeft"])(
    "%s getters use exact type and live source/member references",
    type => {
      const source = { type: "group", groupId: "C1" };
      const joined = { members: [{ type: "user", userId: "U1" }] };
      const left = { members: [{ type: "user", userId: "U2" }] };
      const event = new Event({ type, source, joined, left });
      const flag = `is${type[0].toUpperCase()}${type.slice(1)}`;
      const members = type === "memberJoined" ? joined : left;
      const isMember = type.startsWith("member");
      expect(event[flag]).toBe(true);
      expect(event[type]).toBe(isMember ? members : source);
      event._rawEvent.type = type.toUpperCase();
      expect(event[flag]).toBe(false);
      expect(event[type]).toBe(isMember ? members : null);
    }
  );

  test("non-text message has null text; malformed message matches Bottender's throw", () => {
    const event = new Event({ type: "message", message: { type: "image", id: "1" } });
    expect(event.isMessage).toBe(true);
    expect(event.isText).toBe(false);
    expect(event.text).toBeNull();
    delete event._rawEvent.message;
    expect(() => event.isText).toThrow(TypeError);
  });
});

describe.each(["native", "bottender"])("%s Context shared contract", engine => {
  test.each([undefined, null, false, 0])(
    "falsy persisted state %p gets isolated deep defaults",
    state => {
      const initialState = { nested: { list: [1] }, keep: true };
      const first = make({ initialState, state }, engine);
      const second = make({ initialState, state }, engine);
      expect(first.state).toEqual(initialState);
      expect(first.state).toBe(first.session._state);
      expect(first.state).not.toBe(initialState);
      expect(first.state.nested).not.toBe(second.state.nested);
      first.state.nested.list.push(2);
      expect(second.state.nested.list).toEqual([1]);
      expect(initialState.nested.list).toEqual([1]);
    }
  );

  test("persisted state is reused without defaults; setState shallow-replaces; reset deep-clones", () => {
    const initialState = { nested: { default: true }, newDefault: true };
    const persisted = { nested: { a: 1, b: 2 }, keep: 3 };
    const ctx = make({ initialState, state: persisted }, engine);
    expect(ctx.state).toBe(persisted);
    expect(ctx.state.newDefault).toBeUndefined();
    const nested = { a: 10 };
    expect(ctx.setState({ nested, dynamic: true })).toBeUndefined();
    expect(ctx.state).toEqual({ nested: { a: 10 }, keep: 3, dynamic: true });
    expect(ctx.state.nested).toBe(nested);
    expect(ctx.state).not.toBe(persisted);
    expect(ctx.state).toBe(ctx.session._state);
    expect(ctx.resetState()).toBeUndefined();
    expect(ctx.state).toEqual(initialState);
    expect(ctx.state.nested).not.toBe(initialState.nested);
    const reset = ctx.state;
    ctx.resetState();
    expect(ctx.state.nested).not.toBe(reset.nested);
    expect(make({ state: {}, initialState }, engine).state).toEqual({});
  });

  test.each([1, 5])(
    "%i replies enqueue synchronously then flush once without changing isReplied",
    async count => {
      const ctx = make({}, engine);
      expect(ctx.platform).toBe("line");
      expect(ctx.isReplied).toBe(false);
      for (let i = 0; i < count; i++) expect(ctx.replyText(String(i))).toBeUndefined();
      expect(ctx.client.reply).not.toHaveBeenCalled();
      expect(await ctx.handlerDidEnd()).toBeUndefined();
      expect(ctx.client.reply).toHaveBeenCalledTimes(1);
      expect(ctx.client.reply).toHaveBeenCalledWith(
        "reply-token",
        Array.from({ length: count }, (_, i) => ({ type: "text", text: String(i) }))
      );
      expect(ctx.isReplied).toBe(false);
      await ctx.handlerDidEnd();
      expect(ctx.client.reply).toHaveBeenCalledTimes(1);
    }
  );

  test("helpers spread options at message level and reply preserves object identity", async () => {
    const ctx = make({}, engine);
    const options = { sender: { name: "bot" }, quoteToken: "q", quickReply: { items: [] } };
    const contents = { type: "bubble", body: { type: "box", layout: "vertical", contents: [] } };
    const custom = { type: "textV2", text: "{name}", substitution: { name: { type: "mention" } } };
    ctx.replyText("text", { ...options, text: "override" });
    ctx.replyFlex("alt", contents, options);
    ctx.replyImage({ originalContentUrl: "original", previewImageUrl: "" }, options);
    ctx.replyImage(
      { originalContentUrl: "original", previewImageUrl: "preview" },
      { type: "custom" }
    );
    ctx.reply([custom]);
    await ctx.handlerDidEnd();
    const messages = ctx.client.reply.mock.calls[0][1];
    expect(messages).toEqual([
      { type: "text", text: "override", ...options },
      { type: "flex", altText: "alt", contents, ...options },
      { type: "image", originalContentUrl: "original", previewImageUrl: "original", ...options },
      { type: "custom", originalContentUrl: "original", previewImageUrl: "preview" },
      custom,
    ]);
    expect(messages[1].contents).toBe(contents);
    expect(messages[4]).toBe(custom);
  });

  test.each([true, false])(
    "late reply uses immediate path even after batch flush=%p",
    async queued => {
      const ctx = make({}, engine);
      if (queued) ctx.replyText("queued");
      await ctx.handlerDidEnd();
      const response = { late: true };
      ctx.client.reply.mockImplementation(() => {
        expect(ctx.isReplied).toBe(true);
        return Promise.resolve(response);
      });
      expect(await ctx.replyText("late")).toBe(response);
      expect(ctx.client.reply).toHaveBeenLastCalledWith("reply-token", [
        { type: "text", text: "late" },
      ]);
      expect(ctx.client.reply).toHaveBeenCalledTimes(queued ? 2 : 1);
      expect(() => ctx.replyText("again")).toThrow("Can not reply event multiple times");
    }
  );

  test("missing replyToken skips batch but late reply still calls client with null", async () => {
    const input = raw();
    delete input.replyToken;
    const ctx = make({ rawEvent: input }, engine);
    ctx.replyText("queued");
    await ctx.handlerDidEnd();
    expect(ctx.client.reply).not.toHaveBeenCalled();
    expect(ctx.isReplied).toBe(false);
    await ctx.replyText("late");
    expect(ctx.client.reply).toHaveBeenCalledWith(null, [{ type: "text", text: "late" }]);
    expect(ctx.isReplied).toBe(true);
  });

  test("batch rejection propagates, disables batching, does not mark replied or retry", async () => {
    const ctx = make({}, engine);
    const error = new Error("LINE rejection");
    ctx.client.reply.mockRejectedValue(error);
    ctx.replyText("queued");
    await expect(ctx.handlerDidEnd()).rejects.toBe(error);
    expect(ctx.isReplied).toBe(false);
    await ctx.handlerDidEnd();
    expect(ctx.client.reply).toHaveBeenCalledTimes(1);
    await expect(ctx.replyText("late")).rejects.toBe(error);
    expect(ctx.isReplied).toBe(true);
    expect(() => ctx.replyText("retry")).toThrow("Can not reply event multiple times");
    expect(ctx.client.reply).toHaveBeenCalledTimes(2);
  });

  test.each(["user", "group", "room"])("getUserProfile dispatches %s source", async type => {
    const source = { type, userId: "U1", [`${type}Id`]: `${type}-id` };
    const ctx = make({ rawEvent: raw(source) }, engine);
    expect(ctx.session.id).toBe(`line:${source[`${type}Id`]}`);
    expect(await ctx.getUserProfile()).toEqual({ name: type });
    for (const [sourceType, method] of [
      ["user", "getUserProfile"],
      ["group", "getGroupMemberProfile"],
      ["room", "getRoomMemberProfile"],
    ]) {
      if (sourceType !== type) expect(ctx.client[method]).not.toHaveBeenCalled();
      else {
        const args = type === "user" ? [source.userId] : [source[`${type}Id`], source.userId];
        expect(ctx.client[method]).toHaveBeenCalledWith(...args);
        const error = new Error("profile unavailable");
        ctx.client[method].mockRejectedValue(error);
        await expect(ctx.getUserProfile()).rejects.toBe(error);
      }
    }
  });
});

describe("native-specific context contract", () => {
  test("approved six-message difference: Bottender sends five, native sends all six", async () => {
    const warning = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const engine of ["bottender", "native"]) {
        const ctx = make({}, engine);
        for (let i = 0; i < 6; i++) ctx.replyText(String(i));
        await ctx.handlerDidEnd();
        expect(ctx.client.reply).toHaveBeenCalledTimes(1);
        expect(ctx.client.reply.mock.calls[0][1]).toHaveLength(engine === "native" ? 6 : 5);
      }
    } finally {
      warning.mockRestore();
    }
  });

  test("Context identity, handled helpers, state helper and minimal error hook", () => {
    const ctx = make();
    expect(ctx).toBeInstanceOf(Context);
    expect(ctx.event).toBeInstanceOf(LineEvent);
    expect(ctx.getState()).toBe(ctx.state);
    expect(ctx.isHandled).toBeNull();
    ctx.setAsHandled();
    expect(ctx.isHandled).toBe(true);
    ctx.setAsNotHandled();
    expect(ctx.isHandled).toBe(false);
    const error = new Error("failed");
    ctx.emitError(error);
    expect(ctx._logger.error).toHaveBeenCalledWith(error);
  });

  test("state writes after persistence warn but still change memory", () => {
    const ctx = make({ initialState: { nested: {} } });
    expect(ctx.isSessionWritten).toBe(false);
    ctx.setState({ before: true });
    expect(ctx._logger.warn).not.toHaveBeenCalled();
    ctx.isSessionWritten = true;
    ctx.setState({ late: true });
    expect(ctx.state.late).toBe(true);
    expect(ctx._logger.warn).toHaveBeenLastCalledWith(expect.stringContaining("context.setState"));
    ctx.resetState();
    expect(ctx.state).toEqual({ nested: {} });
    expect(ctx._logger.warn).toHaveBeenLastCalledWith(
      expect.stringContaining("context.resetState")
    );
    expect(ctx.isSessionWritten).toBe(true);
  });

  test("base context without a session warns and never writes", () => {
    const logger = { warn: jest.fn() };
    const ctx = new Context({ logger });
    expect(ctx.session).toBeNull();
    expect(ctx.state).toEqual({});
    ctx.setState({ lost: true });
    ctx.resetState();
    expect(ctx.session).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  test.each([false, true])(
    "six messages go in ONE request without truncation (reject=%p)",
    async reject => {
      const ctx = make();
      const error = new Error("too many messages");
      if (reject) ctx.client.reply.mockRejectedValue(error);
      const messages = Array.from({ length: 6 }, (_, i) => ({ type: "text", text: String(i) }));
      ctx.reply(messages.slice(0, 3));
      ctx.reply(messages.slice(3));
      if (reject) await expect(ctx.handlerDidEnd()).rejects.toBe(error);
      else await ctx.handlerDidEnd();
      expect(ctx.client.reply).toHaveBeenCalledTimes(1);
      expect(ctx.client.reply).toHaveBeenCalledWith("reply-token", messages);
      expect(ctx.isReplied).toBe(false);
      await ctx.handlerDidEnd();
      expect(ctx.client.reply).toHaveBeenCalledTimes(1);
      expect(ctx.push).toBeUndefined();
      expect(ctx.client.push).toBeUndefined();
    }
  );

  test("sendText is replyText and preserves message options", async () => {
    const ctx = make();
    const options = { quoteToken: "q" };
    expect(ctx.sendText("hello", options)).toBeUndefined();
    await ctx.handlerDidEnd();
    expect(ctx.client.reply).toHaveBeenCalledWith("reply-token", [
      { type: "text", text: "hello", ...options },
    ]);
  });

  test("immediate synchronous client throw still leaves isReplied set", async () => {
    const ctx = make();
    await ctx.handlerDidEnd();
    ctx.client.reply.mockImplementation(() => {
      throw new Error("transport failed");
    });
    expect(() => ctx.replyText("late")).toThrow("transport failed");
    expect(ctx.isReplied).toBe(true);
    expect(() => ctx.replyText("again")).toThrow("Can not reply event multiple times");
  });

  test("reply guard runs even during batching", () => {
    const ctx = make();
    ctx._isReplied = true;
    expect(() => ctx.replyText("no")).toThrow("Can not reply event multiple times");
    expect(ctx._replyMessages).toEqual([]);
  });

  test("group without a userId returns null, never tries a profile API", async () => {
    const ctx = make({ rawEvent: raw({ type: "group", groupId: "C1" }) });
    expect(await ctx.getUserProfile()).toBeNull();
    expect(ctx.client.getUserProfile).not.toHaveBeenCalled();
    expect(ctx.client.getGroupMemberProfile).not.toHaveBeenCalled();
    expect(ctx.client.getRoomMemberProfile).not.toHaveBeenCalled();
  });

  test("profile/alias-style raw mutations are visible to subsequent routing", async () => {
    const ctx = make({ initialState: { userDatas: {} } });
    const action = jest.fn(context => context.event.source.id);
    const entry = chain([
      (context, { next }) => {
        context.event._rawEvent.source = { ...context.event.source, id: 123, displayName: "name" };
        context.event._rawEvent.message.text = "command";
        return next;
      },
      router([text("command", action)]),
    ]);
    expect(await run(entry, ctx)).toBe(123);
    expect(action).toHaveBeenCalledTimes(1);
    expect(ctx.event.source.displayName).toBe("name");
  });
});
