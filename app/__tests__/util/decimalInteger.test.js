const {
  canonicalUnsignedInteger,
  canonicalPositiveInteger,
} = require("../../src/util/decimalInteger");

describe("decimalInteger", () => {
  test("canonicalizes exact decimal integers without rounding", () => {
    expect(canonicalUnsignedInteger("0009007199254740993")).toBe("9007199254740993");
    expect(canonicalUnsignedInteger(0)).toBe("0");
    expect(canonicalPositiveInteger(1n)).toBe("1");
  });

  test.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    Infinity,
    -1n,
    "",
    "-1",
    "+1",
    "1.0",
    " 1",
    null,
    undefined,
  ])("rejects inexact or non-canonical input %#", value => {
    expect(() => canonicalUnsignedInteger(value)).toThrow(TypeError);
  });

  test("requires positive values separately", () => {
    expect(() => canonicalPositiveInteger("0")).toThrow(TypeError);
  });
});
