jest.mock("../../util/redis", () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));
jest.mock("axios", () => ({ default: { post: jest.fn() }, post: jest.fn() }));

const redis = require("../../util/redis");
const { default: axios } = require("axios");
const crypto = require("crypto");
const AuthSessionService = require("../AuthSessionService");

const USER_ID = "U" + "a".repeat(32);
const OLD_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...OLD_ENV, LINE_LOGIN_CHANNEL_ID: "1234567890", APP_DOMAIN: "pudding.example" };
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe("parseCookies / readSessionToken", () => {
  it("parses a multi-cookie header and picks the session cookie", () => {
    const header = "foo=1; redive_session=abc%2Fdef; bar=2";
    expect(AuthSessionService.parseCookies(header)).toMatchObject({
      foo: "1",
      redive_session: "abc/def",
      bar: "2",
    });
    expect(AuthSessionService.readSessionToken(header)).toBe("abc/def");
  });

  it("returns null for missing / malformed headers", () => {
    expect(AuthSessionService.readSessionToken(undefined)).toBeNull();
    expect(AuthSessionService.readSessionToken("")).toBeNull();
    expect(AuthSessionService.readSessionToken("redive_session")).toBeNull();
    expect(AuthSessionService.readSessionToken("other=x")).toBeNull();
  });

  it("keeps the first occurrence so a duplicate cookie cannot shadow the real one", () => {
    expect(AuthSessionService.readSessionToken("redive_session=real; redive_session=fake")).toBe(
      "real"
    );
  });
});

describe("isAllowedOrigin", () => {
  it("accepts the canonical APP_DOMAIN origin with or without a scheme", () => {
    expect(AuthSessionService.isAllowedOrigin("https://pudding.example")).toBe(true);
    process.env.APP_DOMAIN = "https://pudding.example";
    expect(AuthSessionService.isAllowedOrigin("https://pudding.example")).toBe(true);
  });

  it("rejects other origins in production", () => {
    process.env.NODE_ENV = "production";
    expect(AuthSessionService.isAllowedOrigin("https://evil.example")).toBe(false);
    expect(AuthSessionService.isAllowedOrigin("http://localhost:3000")).toBe(false);
    expect(AuthSessionService.isAllowedOrigin("null")).toBe(false);
    // suffix / prefix tricks must not pass
    expect(AuthSessionService.isAllowedOrigin("https://pudding.example.evil.com")).toBe(false);
    expect(AuthSessionService.isAllowedOrigin("https://evil-pudding.example")).toBe(false);
  });

  it("allows localhost outside production for the Vite proxy", () => {
    process.env.NODE_ENV = "development";
    expect(AuthSessionService.isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(AuthSessionService.isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
  });

  it("allows an absent Origin (non-browser caller already holds the cookie)", () => {
    expect(AuthSessionService.isAllowedOrigin(undefined)).toBe(true);
    expect(AuthSessionService.isAllowedOrigin("")).toBe(true);
  });
});

describe("verifyIdToken", () => {
  const validPayload = {
    iss: "https://access.line.me",
    aud: "1234567890",
    sub: USER_ID,
    name: "Alice",
    picture: "https://cdn.example/a.jpg",
  };

  it("posts to LINE with the configured client_id and returns only verified claims", async () => {
    axios.post.mockResolvedValue({ data: { ...validPayload, email: "leak@example.com" } });

    const profile = await AuthSessionService.verifyIdToken("id-token");

    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(body).toContain("client_id=1234567890");
    expect(body).toContain("id_token=id-token");
    expect(profile).toEqual({
      userId: USER_ID,
      displayName: "Alice",
      pictureUrl: "https://cdn.example/a.jpg",
    });
  });

  // Every rejection must be an AuthError carrying a code — the router
  // classifies on `code` alone, so an uncoded throw would silently degrade
  // to the 502 fallback.
  async function expectAuthError(promise, code) {
    await expect(promise).rejects.toBeInstanceOf(AuthSessionService.AuthError);
    await expect(promise).rejects.toMatchObject({ code });
  }

  it("rejects a token minted for another channel", async () => {
    axios.post.mockResolvedValue({ data: { ...validPayload, aud: "9999" } });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "INVALID_ID_TOKEN");
  });

  it("rejects a foreign issuer", async () => {
    axios.post.mockResolvedValue({ data: { ...validPayload, iss: "https://evil.example" } });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "INVALID_ID_TOKEN");
  });

  it("rejects a subject that is not a LINE user id", async () => {
    axios.post.mockResolvedValue({ data: { ...validPayload, sub: "not-a-user" } });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "INVALID_ID_TOKEN");
  });

  it("rejects an empty or non-object 200 payload", async () => {
    axios.post.mockResolvedValue({ data: null });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "INVALID_ID_TOKEN");

    axios.post.mockResolvedValue({ data: "not-an-object" });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "INVALID_ID_TOKEN");
  });

  it("accepts an aud array that contains our channel", async () => {
    axios.post.mockResolvedValue({ data: { ...validPayload, aud: ["other", "1234567890"] } });
    await expect(AuthSessionService.verifyIdToken("t")).resolves.toMatchObject({
      userId: USER_ID,
    });
  });

  it.each([400, 401, 403, 404, 429])("classifies a LINE %i as INVALID_ID_TOKEN", async status => {
    axios.post.mockRejectedValue({ response: { status } });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "INVALID_ID_TOKEN");
  });

  it.each([500, 502, 503, 504])("classifies a LINE %i as LINE_UNAVAILABLE", async status => {
    axios.post.mockRejectedValue({ response: { status } });
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "LINE_UNAVAILABLE");
  });

  it("classifies a timeout as LINE_UNAVAILABLE, never as an invalid token", async () => {
    axios.post.mockRejectedValue(
      Object.assign(new Error("timeout of 5000ms exceeded"), { code: "ECONNABORTED" })
    );
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "LINE_UNAVAILABLE");
  });

  it("classifies a network failure (no response) as LINE_UNAVAILABLE", async () => {
    axios.post.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })
    );
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "LINE_UNAVAILABLE");
  });

  it("preserves the underlying error as `cause` for debugging", async () => {
    const underlying = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    axios.post.mockRejectedValue(underlying);
    await expect(AuthSessionService.verifyIdToken("t")).rejects.toMatchObject({
      cause: underlying,
    });
  });

  it("refuses to run without LINE_LOGIN_CHANNEL_ID, before calling LINE", async () => {
    delete process.env.LINE_LOGIN_CHANNEL_ID;
    await expectAuthError(AuthSessionService.verifyIdToken("t"), "AUTH_CONFIG");
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("createSession", () => {
  it("stores a hashed key with a 30-day TTL and NX, and returns the raw token", async () => {
    redis.set.mockResolvedValue("OK");

    const token = await AuthSessionService.createSession({
      userId: USER_ID,
      displayName: "Alice",
      pictureUrl: null,
    });

    // base64url of 32 random bytes
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const [key, value, options] = redis.set.mock.calls[0];
    const expected = crypto.createHash("sha256").update(token).digest("hex");
    expect(key).toBe(`auth:session:${expected}`);
    // the raw token must never be the Redis key
    expect(key).not.toContain(token);
    expect(options).toEqual({ EX: 30 * 24 * 60 * 60, NX: true });

    const stored = JSON.parse(value);
    expect(stored.profile).toEqual({
      userId: USER_ID,
      displayName: "Alice",
      pictureUrl: null,
    });
    expect(typeof stored.createdAt).toBe("string");
  });

  it("stores nothing beyond the normalized profile (no LINE credentials)", async () => {
    redis.set.mockResolvedValue("OK");
    await AuthSessionService.createSession({
      userId: USER_ID,
      displayName: "Alice",
      pictureUrl: null,
      accessToken: "SECRET",
      idToken: "SECRET",
    });

    const value = redis.set.mock.calls[0][1];
    expect(value).not.toContain("SECRET");
    expect(Object.keys(JSON.parse(value))).toEqual(["profile", "createdAt"]);
  });

  it("throws when Redis refuses the write", async () => {
    redis.set.mockResolvedValue(null);
    await expect(AuthSessionService.createSession({ userId: USER_ID })).rejects.toThrow(
      "failed to persist session"
    );
  });

  it("propagates Redis outages instead of swallowing them", async () => {
    redis.set.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(AuthSessionService.createSession({ userId: USER_ID })).rejects.toThrow(
      "ECONNREFUSED"
    );
  });
});

describe("getSession", () => {
  it("returns the normalized profile for a live session", async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({ profile: { userId: USER_ID, displayName: "Alice", pictureUrl: null } })
    );
    await expect(AuthSessionService.getSession("token")).resolves.toEqual({
      userId: USER_ID,
      displayName: "Alice",
      pictureUrl: null,
    });
  });

  it("returns null for a missing, corrupt, or malformed session", async () => {
    redis.get.mockResolvedValue(null);
    await expect(AuthSessionService.getSession("token")).resolves.toBeNull();

    redis.get.mockResolvedValue("{not json");
    await expect(AuthSessionService.getSession("token")).resolves.toBeNull();

    redis.get.mockResolvedValue(JSON.stringify({ profile: { userId: "bogus" } }));
    await expect(AuthSessionService.getSession("token")).resolves.toBeNull();
  });

  it("returns null for an empty token without hitting Redis", async () => {
    await expect(AuthSessionService.getSession("")).resolves.toBeNull();
    await expect(AuthSessionService.getSession(undefined)).resolves.toBeNull();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("propagates Redis outages so callers can answer 503 rather than 401", async () => {
    redis.get.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(AuthSessionService.getSession("token")).rejects.toThrow("ECONNREFUSED");
  });
});

describe("checkOriginConfig", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it("passes quietly in production with a usable APP_DOMAIN", () => {
    process.env.NODE_ENV = "production";
    expect(AuthSessionService.checkOriginConfig()).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs loudly in production when APP_DOMAIN cannot yield an origin", () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_DOMAIN;

    expect(AuthSessionService.checkOriginConfig()).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0][0]).toContain("APP_DOMAIN");
  });

  it("stays silent outside production, where localhost is allowed anyway", () => {
    process.env.NODE_ENV = "development";
    delete process.env.APP_DOMAIN;

    expect(AuthSessionService.checkOriginConfig()).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("destroySession", () => {
  it("deletes the hashed key", async () => {
    redis.del.mockResolvedValue(1);
    await AuthSessionService.destroySession("token");
    const expected = crypto.createHash("sha256").update("token").digest("hex");
    expect(redis.del).toHaveBeenCalledWith(`auth:session:${expected}`);
  });

  it("is a no-op for an empty token", async () => {
    await expect(AuthSessionService.destroySession("")).resolves.toBe(0);
    expect(redis.del).not.toHaveBeenCalled();
  });
});
