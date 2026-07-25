jest.unmock("../validation");

const AdminModel = require("../../model/application/Admin");
const { verifyAdmin, verifyPrivilege } = require("../validation");

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("verifyAdmin", () => {
  test("passes admin lookup failures to Express error handling", async () => {
    const error = new Error("admin lookup failed");
    const lookup = jest.spyOn(AdminModel, "getList").mockRejectedValue(error);
    const req = { profile: { userId: "U" + "a".repeat(32) } };
    const res = response();
    const next = jest.fn();

    try {
      await verifyAdmin(req, res, next);
    } finally {
      lookup.mockRestore();
    }

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("verifyPrivilege", () => {
  test.each(["x", "", "5x", "4", 5.5, null, undefined, -1, Infinity])(
    "rejects invalid or insufficient privilege %p",
    privilege => {
      const req = { profile: { privilege } };
      const res = response();
      const next = jest.fn();

      verifyPrivilege(5)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "forbidden" });
      expect(next).not.toHaveBeenCalled();
    }
  );

  test.each(["5", 5, 6])("allows valid privilege %p at the required level", privilege => {
    const req = { profile: { privilege } };
    const res = response();
    const next = jest.fn();

    verifyPrivilege(5)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a missing admin profile", () => {
    const res = response();
    const next = jest.fn();

    verifyPrivilege(5)({}, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
