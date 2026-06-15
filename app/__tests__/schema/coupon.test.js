const ajv = require("../../src/util/ajv");

describe("couponAdd schema", () => {
  const validPayload = code => ({
    code,
    startAt: "2026-06-15T00:00:00Z",
    endAt: "2026-06-16T00:00:00Z",
    reward: 1,
  });

  it("accepts coupon code up to 50 characters", () => {
    const validate = ajv.getSchema("couponAdd");

    const isValid = validate(validPayload("A".repeat(50)));

    expect(isValid).toBe(true);
  });

  it("rejects coupon code longer than 50 characters", () => {
    const validate = ajv.getSchema("couponAdd");

    const isValid = validate(validPayload("A".repeat(51)));

    expect(isValid).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/code",
          keyword: "maxLength",
        }),
      ])
    );
  });
});
