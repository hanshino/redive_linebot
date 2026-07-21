function canonicalUnsignedInteger(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value).toString();
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  throw new TypeError("Expected an exact nonnegative integer");
}

function canonicalPositiveInteger(value) {
  const normalized = canonicalUnsignedInteger(value);
  if (normalized === "0") throw new TypeError("Expected an exact positive integer");
  return normalized;
}

module.exports = { canonicalUnsignedInteger, canonicalPositiveInteger };
