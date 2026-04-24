// jest.config disables babel transform, so jest.mock is NOT hoisted — must be
// declared before any require of the mocked module path.
jest.mock("../../src/util/replyTokenQueue", () => ({
  saveToken: jest.fn().mockResolvedValue(undefined),
  pullFreshToken: jest.fn(),
}));

const replyTokenQueue = require("../../src/util/replyTokenQueue");
const { saveReplyToken } = require("../../bin/EventDequeue").__testing;

function makeEvent(type, id, token = "reply-tok-123") {
  return {
    replyToken: token,
    timestamp: 1700000000000,
    source: { type, [`${type}Id`]: id },
  };
}

describe("EventDequeue.saveReplyToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("saves token for group sources (C-prefixed)", async () => {
    await saveReplyToken(makeEvent("group", "C" + "a".repeat(32)));
    expect(replyTokenQueue.saveToken).toHaveBeenCalledWith(
      "C" + "a".repeat(32),
      "reply-tok-123",
      1700000000000
    );
  });

  it("saves token for user sources (U-prefixed)", async () => {
    await saveReplyToken(makeEvent("user", "U" + "b".repeat(32)));
    expect(replyTokenQueue.saveToken).toHaveBeenCalledWith(
      "U" + "b".repeat(32),
      "reply-tok-123",
      1700000000000
    );
  });

  it("saves token for room sources (R-prefixed) — M4 regex expansion", async () => {
    await saveReplyToken(makeEvent("room", "R" + "c".repeat(32)));
    expect(replyTokenQueue.saveToken).toHaveBeenCalledWith(
      "R" + "c".repeat(32),
      "reply-tok-123",
      1700000000000
    );
  });

  it("ignores invalid sourceId shapes", async () => {
    await saveReplyToken(makeEvent("group", "badid"));
    await saveReplyToken(makeEvent("group", "X" + "a".repeat(32)));
    expect(replyTokenQueue.saveToken).not.toHaveBeenCalled();
  });

  it("ignores events with no replyToken", async () => {
    await saveReplyToken(makeEvent("group", "C" + "a".repeat(32), null));
    await saveReplyToken(makeEvent("group", "C" + "a".repeat(32), ""));
    expect(replyTokenQueue.saveToken).not.toHaveBeenCalled();
  });
});
