// The global setup.js mocks this module to bypass auth everywhere else;
// these tests are about the real thing.
jest.unmock("../validation");
jest.mock("../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../service/AuthSessionService");
  return {
    ...actual,
    getSession: jest.fn(),
  };
});
jest.mock("../../model/application/Admin", () => ({
  getList: jest.fn().mockResolvedValue([]),
}));

const AuthSessionService = require("../../service/AuthSessionService");
const AdminModel = require("../../model/application/Admin");
const { verifyToken, socketSetProfile, socketVerifyAdmin } = jest.requireActual("../validation");

const USER_ID = "U" + "a".repeat(32);
const PROFILE = { userId: USER_ID, displayName: "Alice", pictureUrl: null };
const OLD_ENV = process.env;

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq({ method = "GET", cookie, origin } = {}) {
  const headers = {};
  if (cookie !== undefined) headers.cookie = cookie;
  if (origin !== undefined) headers.origin = origin;
  return {
    method,
    headers,
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...OLD_ENV, NODE_ENV: "production", APP_DOMAIN: "pudding.example" };
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe("verifyToken (cookie session)", () => {
  it("sets req.profile from the session and calls next", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const req = makeReq({ cookie: "redive_session=tok" });
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(AuthSessionService.getSession).toHaveBeenCalledWith("tok");
    expect(req.profile).toEqual(PROFILE);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  it("401s when no cookie is present", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
  });

  it("401s when the session is missing or invalid in Redis", async () => {
    AuthSessionService.getSession.mockResolvedValue(null);
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(makeReq({ cookie: "redive_session=stale" }), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("503s (not 401) when Redis is unreachable, so the cookie survives", async () => {
    AuthSessionService.getSession.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(makeReq({ cookie: "redive_session=tok" }), res, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("ignores an Authorization bearer header — no fallback path remains", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const req = makeReq();
    req.headers.authorization = "Bearer liff-access-token";
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s an unsafe request from a foreign origin (CSRF guard)", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(
      makeReq({ method: "POST", cookie: "redive_session=tok", origin: "https://evil.example" }),
      res,
      next
    );

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
  });

  it("allows an unsafe request from the canonical origin", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(
      makeReq({ method: "POST", cookie: "redive_session=tok", origin: "https://pudding.example" }),
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not origin-check safe reads", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const res = makeRes();
    const next = jest.fn();

    await verifyToken(
      makeReq({ cookie: "redive_session=tok", origin: "https://evil.example" }),
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("socketSetProfile", () => {
  function makeSocket({ cookie, origin } = {}) {
    const headers = {};
    if (cookie !== undefined) headers.cookie = cookie;
    if (origin !== undefined) headers.origin = origin;
    return { handshake: { headers }, data: {} };
  }

  it("puts the profile on socket.data and calls next once", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const socket = makeSocket({ cookie: "redive_session=tok", origin: "https://pudding.example" });
    const next = jest.fn();

    await socketSetProfile(socket, next);

    expect(socket.data.profile).toEqual(PROFILE);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a handshake with no cookie", async () => {
    const next = jest.fn();
    await socketSetProfile(makeSocket(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("rejects a cross-origin handshake", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const next = jest.fn();

    await socketSetProfile(
      makeSocket({ cookie: "redive_session=tok", origin: "https://evil.example" }),
      next
    );

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(AuthSessionService.getSession).not.toHaveBeenCalled();
  });

  it("rejects a dead session", async () => {
    AuthSessionService.getSession.mockResolvedValue(null);
    const socket = makeSocket({ cookie: "redive_session=stale" });
    const next = jest.fn();

    await socketSetProfile(socket, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(socket.data.profile).toBeUndefined();
  });

  it("does not ignore a token supplied via handshake.query", async () => {
    AuthSessionService.getSession.mockResolvedValue(PROFILE);
    const socket = makeSocket();
    socket.handshake.query = { token: "liff-access-token" };
    const next = jest.fn();

    await socketSetProfile(socket, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("socketVerifyAdmin", () => {
  it("calls next exactly once when the user is not an admin", async () => {
    AdminModel.getList.mockResolvedValue([]);
    const next = jest.fn();

    await socketVerifyAdmin({ data: { profile: PROFILE } }, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("merges admin data and passes when the user is an admin", async () => {
    AdminModel.getList.mockResolvedValue([{ userId: USER_ID, privilege: 9 }]);
    const socket = { data: { profile: PROFILE } };
    const next = jest.fn();

    await socketVerifyAdmin(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.profile.privilege).toBe(9);
  });

  it("rejects when the admin lookup blows up", async () => {
    AdminModel.getList.mockRejectedValue(new Error("db down"));
    const next = jest.fn();

    await socketVerifyAdmin({ data: { profile: PROFILE } }, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
