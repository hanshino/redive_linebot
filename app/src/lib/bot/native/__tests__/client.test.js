const { Readable } = require("node:stream");
const { HTTPFetchError } = require("@line/bot-sdk");
const { createLineClient } = require("../client");

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
  let blob;
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
    blob = { getMessageContent: jest.fn() };
    client = createLineClient({ api, blob });
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
    blob.getMessageContent.mockResolvedValue(Readable.from(chunks));
    const result = await client.getMessageContent("M1");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toEqual(Buffer.concat(chunks));
    expect(blob.getMessageContent).toHaveBeenCalledWith("M1");
  });

  test("getMessageContent returns an empty Buffer for an empty stream", async () => {
    blob.getMessageContent.mockResolvedValue(Readable.from([]));
    await expect(client.getMessageContent("M1")).resolves.toEqual(Buffer.alloc(0));
  });

  test("getMessageContent rejects on a stream error instead of returning partial content", async () => {
    const error = new Error("Stream failure");
    blob.getMessageContent.mockResolvedValue(
      Readable.from(
        (async function* () {
          yield Buffer.from("partial");
          throw error;
        })()
      )
    );
    await expect(client.getMessageContent("M1")).rejects.toBe(error);
  });

  test("getMessageContent forwards blob API errors", async () => {
    const error = httpError(404);
    blob.getMessageContent.mockRejectedValue(error);
    await expect(client.getMessageContent("M1")).rejects.toBe(error);
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
      expect(blobConstructor).toHaveBeenCalledTimes(1);
      expect(apiConstructor).toHaveBeenCalledWith({ channelAccessToken: "test-token" });
      expect(blobConstructor).toHaveBeenCalledWith({ channelAccessToken: "test-token" });
      expect(() => getClient("unknown")).toThrow("Unknown bot client: unknown");
    });
  });

  test.each([undefined, null, "LINE", "telegram"])("rejects unknown client name %s", name => {
    const { getClient } = require("../client");
    expect(() => getClient(name)).toThrow("Unknown bot client:");
  });
});
