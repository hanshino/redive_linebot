// verifySponsorshipOwner / isSponsorshipOwner —— 走真實 middleware，不用
// app/__tests__/setup.js 的全域 auth mock（那個 mock 直接放行一切，用它測授權等於沒測）。
// 比照 validation.auth.test.js 的手法：jest.unmock + jest.requireActual。
jest.unmock("../validation");
jest.mock("../../model/application/Admin", () => ({
  getList: jest.fn().mockResolvedValue([]),
}));

const { verifySponsorshipOwner, isSponsorshipOwner } = jest.requireActual("../validation");

const OWNER_ID = "U" + "a".repeat(32);
const OTHER_ID = "U" + "b".repeat(32);
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

beforeEach(() => {
  process.env = { ...OLD_ENV };
  delete process.env.SPONSORSHIP_OWNER_LINE_USER_ID;
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe("verifySponsorshipOwner", () => {
  it("503s (fail closed) when the env var is missing entirely", () => {
    const req = { profile: { userId: OWNER_ID } };
    const res = makeRes();
    const next = jest.fn();

    verifySponsorshipOwner(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("503s (fail closed) when the env var has an invalid format — even for the owner", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = "not-a-line-user-id";
    const req = { profile: { userId: "not-a-line-user-id" } };
    const res = makeRes();
    const next = jest.fn();

    verifySponsorshipOwner(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not fall into the undefined === undefined trap when env is unset and profile is missing", () => {
    // Regression guard: this is exactly the bug the spec calls out — if the
    // implementation only checked `!ownerId` before comparing, an absent
    // env var and an absent req.profile.userId would both be undefined and
    // compare equal, letting an unauthenticated caller through.
    const req = {};
    const res = makeRes();
    const next = jest.fn();

    verifySponsorshipOwner(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the exact owner through when configured", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = OWNER_ID;
    const req = { profile: { userId: OWNER_ID } };
    const res = makeRes();
    const next = jest.fn();

    verifySponsorshipOwner(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  it("403s a non-owner, even an existing admin with privilege 9", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = OWNER_ID;
    const req = { profile: { userId: OTHER_ID, privilege: 9 } };
    const res = makeRes();
    const next = jest.fn();

    verifySponsorshipOwner(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("403s when req.profile is missing (should never happen after verifyToken, but must not throw/pass)", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = OWNER_ID;
    const req = {};
    const res = makeRes();
    const next = jest.fn();

    expect(() => verifySponsorshipOwner(req, res, next)).not.toThrow();
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("isSponsorshipOwner", () => {
  it("returns false when unconfigured", () => {
    expect(isSponsorshipOwner(OWNER_ID)).toBe(false);
  });

  it("returns false for invalid env format even if userId matches the raw string", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = "garbage";
    expect(isSponsorshipOwner("garbage")).toBe(false);
  });

  it("returns true only for the exact configured owner", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = OWNER_ID;
    expect(isSponsorshipOwner(OWNER_ID)).toBe(true);
    expect(isSponsorshipOwner(OTHER_ID)).toBe(false);
  });

  it("returns false for undefined/null userId even when owner is configured", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = OWNER_ID;
    expect(isSponsorshipOwner(undefined)).toBe(false);
    expect(isSponsorshipOwner(null)).toBe(false);
  });

  it("uses the same comparison verifySponsorshipOwner uses (no drift between /me and the guard)", () => {
    process.env.SPONSORSHIP_OWNER_LINE_USER_ID = OWNER_ID;
    const req = { profile: { userId: OWNER_ID } };
    const res = makeRes();
    const next = jest.fn();

    verifySponsorshipOwner(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(isSponsorshipOwner(OWNER_ID)).toBe(true);
  });
});
