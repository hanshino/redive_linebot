// Group display name resolution. v1: simple last-4 fallback when no name cache.
export function groupLabel(groupId) {
  if (!groupId) return "群組";
  return `…${groupId.slice(-4).toLowerCase()}`;
}
