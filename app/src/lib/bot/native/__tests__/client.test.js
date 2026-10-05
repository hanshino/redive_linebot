const { HTTPFetchError } = require("@line/bot-sdk");
const { createLineClient } = require("../client");
const { createStateStore } = require("../state-store");

function httpError(status) {
  return new HTTPFetchError("LINE request failed", {
    status,
    statusText: "Test error",
    headers: new Headers(),
    body: "{}",
  });
}

describe("native LINE client adapter", () => {
  let api;
  let fetchContent;
  let client;

  beforeEach(() => {
    api = {
      getProfile: jest.fn(),
      getGroupMemberProfile: jest.fn(),
      getRoomMemberProfile: jest.fn(),
      getGroupSummary: jest.fn(),
      getGroupMemberCount: jest.fn(),
      replyMessage: jest.fn(),
    };
    fetchContent = jest.fn();
    client = createLineClient({ api, fetch: fetchContent, channelAccessToken: "test-token" });
  });

  test.each([
    ["getUserProfile", "getProfile", ["U1"], { userId: "U1", displayName: "User" }],
    ["getProfile", "getProfile", ["U1"], { userId: "U1", displayName: "User" }],
    ["getGroupMemberProfile", "getGroupMemberProfile", ["C1", "U1"], { displayName: "Member" }],
    ["getRoomMemberProfile", "getRoomMemberProfile", ["R1", "U1"], { displayName: "Member" }],
    [
      "getGroupSummary",
      "getGroupSummary",
      ["C1"],
      { groupId: "C1", groupName: "Group", pictureUrl: "https://example.com/group.png" },
    ],
    ["getGroupSummary", "getGroupSummary", ["C1"], { groupId: "C1", groupName: "Group" }],
    ["getGroupCount", "getGroupMemberCount", ["C1"], { count: 3 }],
  ])(
    "%s forwards arguments and returns the decoded body",
    async (method, sdkMethod, args, body) => {
      api[sdkMethod].mockResolvedValue(body);
      await expect(client[method](...args)).resolves.toBe(body);
      expect(api[sdkMethod]).toHaveBeenCalledWith(...args);
    }
  );

  test("getProfile is an alias of getUserProfile", () => {
    expect(client.getProfile).toBe(client.getUserProfile);
  });

  test.each([0, 3])("getGroupMembersCount preserves the legacy number shape (%i)", async count => {
    api.getGroupMemberCount.mockResolvedValue({ count });
    await expect(client.getGroupMembersCount("C1")).resolves.toBe(count);
    expect(api.getGroupMemberCount).toHaveBeenCalledWith("C1");
  });

  describe.each(["getUserProfile", "getProfile"])("%s error adaptation", method => {
    test("only SDK HTTP 404 resolves to null", async () => {
      api.getProfile.mockRejectedValue(httpError(404));
      await expect(client[method]("U1")).resolves.toBeNull();
    });

    test.each([401, 429, 500])("HTTP %i rejects unchanged", async status => {
      const error = httpError(status);
      api.getProfile.mockRejectedValue(error);
      await expect(client[method]("U1")).rejects.toBe(error);
    });

    test("non-HTTP errors reject unchanged", async () => {
      const error = new Error("Network failure");
      api.getProfile.mockRejectedValue(error);
      await expect(client[method]("U1")).rejects.toBe(error);
    });
  });

  test.each([
    ["getGroupMemberProfile", "getGroupMemberProfile", ["C1", "U1"]],
    ["getRoomMemberProfile", "getRoomMemberProfile", ["R1", "U1"]],
    ["getGroupSummary", "getGroupSummary", ["C1"]],
    ["getGroupCount", "getGroupMemberCount", ["C1"]],
    ["getGroupMembersCount", "getGroupMemberCount", ["C1"]],
  ])("%s does not swallow HTTP 404", async (method, sdkMethod, args) => {
    const error = httpError(404);
    api[sdkMethod].mockRejectedValue(error);
    await expect(client[method](...args)).rejects.toBe(error);
  });

  test("getMessageContent collects multiple binary chunks into a Buffer", async () => {
    const chunks = [Buffer.from([0, 255]), Buffer.from("image"), Buffer.from([128])];
    fetchContent.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            chunks.forEach(chunk => controller.enqueue(chunk));
            controller.close();
          },
        })
      )
    );
    const result = await client.getMessageContent("M1");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toEqual(Buffer.concat(chunks));
    expect(fetchContent).toHaveBeenCalledWith(
      "https://api-data.line.me/v2/bot/message/M1/content",
      {
        method: "GET",
        headers: { Authorization: "Bearer test-token" },
        signal: expect.any(AbortSignal),
      }
    );
  });

  test("getMessageContent returns an empty Buffer for an empty stream", async () => {
    fetchContent.mockResolvedValue(new Response(null));
    await expect(client.getMessageContent("M1")).resolves.toEqual(Buffer.alloc(0));
  });

  test("Web body failure rejects without unhandled rejection and releases the same-source queue", async () => {
    const error = new Error("Stream failure");
    let pulls = 0;
    fetchContent.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (pulls++ === 0) controller.enqueue(Buffer.from("partial"));
            else controller.error(error);
          },
        })
      )
    );
    const store = createStateStore({ redis: {}, logger: { debug: jest.fn() } });
    const source = { type: "group", groupId: "C1" };
    const first = store.runSerial(source, () => client.getMessageContent("M1"));
    const rejection = expect(first).rejects.toBe(error);
    const next = store.runSerial(source, () => "next ran");
    await rejection;
    await expect(next).resolves.toBe("next ran");
    await store.drain();
    expect(store.pendingTaskCount()).toBe(0);
    // Let unhandled rejections surface to Jest; do not install process-level handlers.
    await new Promise(resolve => setImmediate(resolve));
  });

  test("getMessageContent forwards fetch network errors", async () => {
    const error = new Error("Network failure");
    fetchContent.mockRejectedValue(error);
    await expect(client.getMessageContent("M1")).rejects.toBe(error);
  });

  test.each([404, 500])(
    "content HTTP %i has status but no token, headers or response body",
    async status => {
      fetchContent.mockResolvedValue(new Response("sensitive remote body", { status }));
      const error = await client.getMessageContent("M1").catch(error => error);
      expect(error).toBeInstanceOf(Error);
      expect(error.status).toBe(status);
      expect(error.headers).toBeUndefined();
      expect(error.message).toBe(`LINE message content request failed (${status})`);
      expect(JSON.stringify(error)).not.toMatch(/test-token|Authorization|sensitive/);
    }
  );

  test("content timeout covers body consumption and message ID is URL-encoded", async () => {
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fetchContent.mockImplementation(
      async (_url, { signal }) =>
        new Response(
          new ReadableStream({
            start(body) {
              signal.addEventListener("abort", () => body.error(signal.reason), { once: true });
            },
          })
        )
    );
    try {
      const result = client.getMessageContent("M/1?query");
      const rejection = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
      controller.abort(new DOMException("Timed out", "TimeoutError"));
      await rejection;
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(fetchContent.mock.calls[0][0]).toBe(
        "https://api-data.line.me/v2/bot/message/M%2F1%3Fquery/content"
      );
    } finally {
      timeout.mockRestore();
    }
  });

  test("reply normalizes a single message and returns the API response", async () => {
    const message = { type: "text", text: "Hello", quoteToken: "quote" };
    const response = { sentMessages: [{ id: "M1", quoteToken: "new-quote" }] };
    api.replyMessage.mockResolvedValue(response);
    await expect(client.reply("reply-token", message)).resolves.toBe(response);
    expect(api.replyMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      messages: [message],
    });
  });

  test("reply preserves arrays and does not truncate or split more than five messages", async () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({ type: "text", text: `${i}` }));
    await client.reply("reply-token", messages);
    expect(api.replyMessage).toHaveBeenCalledTimes(1);
    expect(api.replyMessage.mock.calls[0][0].messages).toBe(messages);
  });

  test("reply delegates through the adapter replyMessage for instrumentation", async () => {
    const wrapped = jest.spyOn(client, "replyMessage");
    await client.reply("reply-token", []);
    expect(wrapped).toHaveBeenCalledWith({ replyToken: "reply-token", messages: [] });
  });

  test("replyMessage forwards the request unchanged", async () => {
    const request = { replyToken: "reply-token", messages: [], notificationDisabled: true };
    const response = { sentMessages: [] };
    api.replyMessage.mockResolvedValue(response);
    await expect(client.replyMessage(request)).resolves.toBe(response);
    expect(api.replyMessage.mock.calls[0][0]).toBe(request);
  });

  test.each(["reply", "replyMessage"])(
    "%s rejects without retry or push fallback",
    async method => {
      const error = httpError(400);
      api.replyMessage.mockRejectedValue(error);
      const args =
        method === "reply" ? ["reply-token", []] : [{ replyToken: "reply-token", messages: [] }];
      await expect(client[method](...args)).rejects.toBe(error);
      expect(api.replyMessage).toHaveBeenCalledTimes(1);
      expect(client.pushMessage).toBeUndefined();
      expect(client.multicast).toBeUndefined();
      expect(client.broadcast).toBeUndefined();
    }
  );
});

describe("getClient", () => {
  afterEach(() => jest.restoreAllMocks());

  test("constructs official clients lazily from the env and reuses a process-local singleton", () => {
    jest.replaceProperty(process, "env", { ...process.env, LINE_ACCESS_TOKEN: "test-token" });
    jest.isolateModules(() => {
      const { messagingApi } = require("@line/bot-sdk");
      const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;
      const apiConstructor = jest
        .spyOn(messagingApi, "MessagingApiClient")
        .mockImplementation(config => new MessagingApiClient(config));
      const blobConstructor = jest
        .spyOn(messagingApi, "MessagingApiBlobClient")
        .mockImplementation(config => new MessagingApiBlobClient(config));
      const { getClient } = require("../client");
      expect(apiConstructor).not.toHaveBeenCalled();
      expect(blobConstructor).not.toHaveBeenCalled();
      expect(() => getClient("unknown")).toThrow("Unknown bot client: unknown");
      expect(apiConstructor).not.toHaveBeenCalled();
      const first = getClient("line");
      expect(getClient("line")).toBe(first);
      expect(apiConstructor).toHaveBeenCalledTimes(1);
      expect(blobConstructor).not.toHaveBeenCalled();
      expect(apiConstructor).toHaveBeenCalledWith({ channelAccessToken: "test-token" });
      expect(() => getClient("unknown")).toThrow("Unknown bot client: unknown");
    });
  });

  test.each([undefined, null, "LINE", "telegram"])("rejects unknown client name %s", name => {
    const { getClient } = require("../client");
    expect(() => getClient(name)).toThrow("Unknown bot client:");
  });
});
