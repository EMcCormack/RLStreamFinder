export const RECENT_STREAM_STATUS_MS = 5 * 60 * 1000;
export const MAX_PREVIOUS_STREAMERS = 10;

export function limitPreviousStreamers(items, activeNames, dismissedKeys = new Set()) {
  let previousCount = 0;
  return items.filter((item) => {
    const name = item.playerName?.trim().toLowerCase();
    const key = item.matchedLogin?.toLowerCase() || name;
    if (activeNames.has(name) && !dismissedKeys.has(key)) return true;
    previousCount += 1;
    return previousCount <= MAX_PREVIOUS_STREAMERS;
  });
}

export function markStreamerDeparture(items, departedNames, departedAt, dismissedKeys = new Set()) {
  return items.map((item) => {
    const name = item.playerName?.trim().toLowerCase();
    const key = item.matchedLogin?.toLowerCase() || name;
    if (!item.matchedLogin || !departedNames.has(name) || dismissedKeys.has(key)) return item;
    return { ...item, previousStatusExpiresAt: departedAt + RECENT_STREAM_STATUS_MS };
  });
}

export function hasRecentStreamStatus(item, now) {
  return Boolean(item.matchedLogin)
    && Number.isFinite(item.previousStatusExpiresAt)
    && now < item.previousStatusExpiresAt;
}
