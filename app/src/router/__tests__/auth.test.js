const request = require("supertest");
const express = require("express");

jest.mock("../../service/AuthSessionService", () => {
  const actual = jest.requireActual("../../service/AuthSessionService");
  return {
    ...actual,
    verifyIdToken: jest.fn(),
    createSession: jest.fn(),
    destroySession: jest.fn(),
  };
});

const AuthSessionService = require("../../service/AuthSessionService");

const USER_ID = "U" + "a".repeat(32);
const PROFILE = { userId: USER_ID, displayName: "Alice", pictureUrl: null };
const OLD_ENV = process.env;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", require("../auth"));
  return app;
}

let app;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...OLD_ENV, NODE_ENV: "production", APP_DOMAIN: "pudding.example" };
  jest.spyOn(console, "error").mockImplementation(() => {});
  app = createApp();
});

afterEach(() => {
  console.error.mockRestore();
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe("POST /api/auth/session", () => {
  it("exchanges a verified ID token for an HttpOnly session cookie", async () => {
    AuthSessionService.verifyIdToken.mockResolvedValue(PROFILE);
    AuthSessionService.createSession.mockResolvedValue("session-token");

    const res = await request(app)
      .post("/api/auth/session")
      .set("Origin", "https://pudding.example")
      .send({ idToken: "id-token" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(PROFILE);
    expect(AuthSessionService.verifyIdToken).toHaveBeenCalledWith("id-token");
    expect(AuthSessionService.createSession).toHaveBeenCalledWith(PROFILE);

    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toContain("redive_session=session-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).toContain("Max-Age=2592000");
    // the LIFF ID token must never come back to the browser
    expect(res.headers["set-cookie"].join()).not.toContain("id-token");
  });

  it("omits Secure outside production so http://localhost works", async () => {
    process.env.NODE_ENV = "development";
    AuthSessionService.verifyIdToken.mockResolvedValue(PROFILE);
    AuthSessionService.createSession.mockResolvedValue("session-token");

    const res = await request(app)
      .post("/api/auth/session")
      .set("Origin", "http://localhost:3000")
      .send({ idToken: "id-token" });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).not.toContain("Secure");
  });

  it("rotates: new session is minted before the old one is dropped", async () => {
    AuthSessionService.verifyIdToken.mockResolvedValue(PROFILE);
    AuthSessionService.createSession.mockResolvedValue("new-token");
    AuthSessionService.destroySession.mockResolvedValue(1);

    const res = await request(app)
      .post("/api/auth/session")
      .set("Cookie", "redive_session=old-token")
      .send({ idToken: "id-token" });

    expect(res.status).toBe(200);
    expect(AuthSessionService.destroySession).toHaveBeenCalledWith("old-token");
    expect(AuthSessionService.createSession.mock.invocationCallOrder[0]).toBeLessThan(
      AuthSessionService.destroySession.mock.invocationCallOrder[0]
    );
  });

  it("keeps the old session when minting the new one fails", async () => {
    AuthSessionService.verifyIdToken.mockResolvedValue(PROFILE);
    AuthSessionService.createSession.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app)
      .post("/api/auth/session")
      .set("Cookie", "redive_session=old-token")
      .send({ idToken: "id-token" });

    expect(res.status).toBe(503);
    expect(AuthSessionService.destroySession).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  // The exchange has four distinct failure modes and they must NOT collapse
  // into one status. Only 401 tells the frontend "your session is invalid";
  // reporting a LINE outage or a config gap that way would make it discard a
  // working login and, in the outage case, hammer login on every retry.
  describe("verify failure classification", () => {
    const { AuthError } = jest.requireActual("../../service/AuthSessionService");

    it("401s when LINE explicitly rejects the token", async () => {
      AuthSessionService.verifyIdToken.mockRejectedValue(
        new AuthError("INVALID_ID_TOKEN", "LINE rejected the id token (400)")
      );

      const res = await request(app).post("/api/auth/session").send({ idToken: "forged" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: "invalid id token." });
      expect(AuthSessionService.createSession).not.toHaveBeenCalled();
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("401s when the 200 payload fails aud/iss/sub checks", async () => {
      AuthSessionService.verifyIdToken.mockRejectedValue(
        new AuthError("INVALID_ID_TOKEN", "id token verify: audience mismatch")
      );

      const res = await request(app).post("/api/auth/session").send({ idToken: "forged" });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: "invalid id token." });
    });

    it("502s — not 401 — when LINE is unreachable or times out", async () => {
      AuthSessionService.verifyIdToken.mockRejectedValue(
        new AuthError("LINE_UNAVAILABLE", "LINE verify endpoint unreachable (ECONNABORTED)")
      );

      const res = await request(app).post("/api/auth/session").send({ idToken: "id-token" });

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ message: "line authentication unavailable." });
      expect(AuthSessionService.createSession).not.toHaveBeenCalled();
      // no cookie is cleared either — the caller's existing session survives
      expect(res.headers["set-cookie"]).toBeUndefined();
    });

    it("503s when LINE_LOGIN_CHANNEL_ID is not configured", async () => {
      AuthSessionService.verifyIdToken.mockRejectedValue(
        new AuthError("AUTH_CONFIG", "LINE_LOGIN_CHANNEL_ID is not configured")
      );

      const res = await request(app).post("/api/auth/session").send({ idToken: "id-token" });

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ message: "auth configuration unavailable." });
    });

    it("502s an unclassified error rather than claiming the token is invalid", async () => {
      AuthSessionService.verifyIdToken.mockRejectedValue(new TypeError("undefined is not a fn"));

      const res = await request(app).post("/api/auth/session").send({ idToken: "id-token" });

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ message: "line authentication unavailable." });
    });
  });

  it("400s a missing or non-string idToken", async () => {
    expect((await request(app).post("/api/auth/session").send({})).status).toBe(400);
    expect((await request(app).post("/api/auth/session").send({ idToken: 42 })).status).toBe(400);
    expect((await request(app).post("/api/auth/session").send({ idToken: "" })).status).toBe(400);
    expect(AuthSessionService.verifyIdToken).not.toHaveBeenCalled();
  });

  it("400s an oversized idToken without spending an outbound call on it", async () => {
    const { MAX_ID_TOKEN_LENGTH } = jest.requireActual("../../service/AuthSessionService");

    const res = await request(app)
      .post("/api/auth/session")
      .send({ idToken: "x".repeat(MAX_ID_TOKEN_LENGTH + 1) });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "idToken is malformed." });
    expect(AuthSessionService.verifyIdToken).not.toHaveBeenCalled();
  });

  it("still accepts a token right at the length limit", async () => {
    const { MAX_ID_TOKEN_LENGTH } = jest.requireActual("../../service/AuthSessionService");
    AuthSessionService.verifyIdToken.mockResolvedValue(PROFILE);
    AuthSessionService.createSession.mockResolvedValue("session-token");

    const res = await request(app)
      .post("/api/auth/session")
      .send({ idToken: "x".repeat(MAX_ID_TOKEN_LENGTH) });

    expect(res.status).toBe(200);
    expect(AuthSessionService.verifyIdToken).toHaveBeenCalled();
  });

  it("403s a cross-origin exchange attempt", async () => {
    const res = await request(app)
      .post("/api/auth/session")
      .set("Origin", "https://evil.example")
      .send({ idToken: "id-token" });

    expect(res.status).toBe(403);
    expect(AuthSessionService.verifyIdToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout", () => {
  it("deletes the session and clears the cookie", async () => {
    AuthSessionService.destroySession.mockResolvedValue(1);

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://pudding.example")
      .set("Cookie", "redive_session=tok");

    expect(res.status).toBe(200);
    expect(AuthSessionService.destroySession).toHaveBeenCalledWith("tok");
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toContain("redive_session=;");
    expect(cookie).toContain("HttpOnly");
  });

  it("is idempotent when there is no session cookie", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(AuthSessionService.destroySession).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"][0]).toContain("redive_session=;");
  });

  it("503s and keeps the cookie when Redis cannot be reached", async () => {
    AuthSessionService.destroySession.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).post("/api/auth/logout").set("Cookie", "redive_session=tok");

    expect(res.status).toBe(503);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("403s a cross-origin logout", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "https://evil.example")
      .set("Cookie", "redive_session=tok");

    expect(res.status).toBe(403);
    expect(AuthSessionService.destroySession).not.toHaveBeenCalled();
  });
});
