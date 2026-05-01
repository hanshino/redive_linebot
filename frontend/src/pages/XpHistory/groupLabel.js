// Group display: short id suffix as the unique tag, optional human name when known.
const shortId = groupId => `…${(groupId || "").slice(-4).toLowerCase()}`;

export function groupLabel(groupId) {
  if (!groupId) return "群組";
  return shortId(groupId);
}

export function makeGroupLabel(nameMap) {
  return groupId => {
    if (!groupId) return "群組";
    const name = nameMap?.[groupId];
    return name ? `${name} · ${shortId(groupId)}` : shortId(groupId);
  };
}
