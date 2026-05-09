export const trim = n => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  return Number(num.toFixed(2)).toString();
};

export const mult = n => `×${trim(n)}`;
