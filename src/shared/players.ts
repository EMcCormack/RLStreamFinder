const STREAM_HINT_RE = /^(?:ttv|twitch)|(^|[^a-z0-9])(ttv|twitch|tv)(?=$|[^a-z0-9])|(?:ttv|twitch|tv)$/i;

export function normalizeLoginCandidate(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
}

export function normalizeFuzzyName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

export function stripStreamMarkers(normalizedName) {
  return normalizedName
    .replace(/_?(twitch|ttv|tv)_?/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function buildPlayerCandidate(name) {
  const loginCandidate = normalizeLoginCandidate(name);
  const cleanedLoginCandidate = stripStreamMarkers(loginCandidate) || loginCandidate;
  const fuzzyName = normalizeFuzzyName(name);
  const cleanedFuzzyName = stripStreamMarkers(fuzzyName) || fuzzyName;

  return {
    rawName: name,
    loginCandidate,
    cleanedLoginCandidate,
    fuzzyName,
    cleanedFuzzyName,
    hasTtvHint: STREAM_HINT_RE.test(name),
  };
}

export function buildSearchQueries(candidate) {
  return [
    ...new Set([
      candidate.loginCandidate,
      candidate.cleanedLoginCandidate,
    ]),
  ].filter(Boolean);
}
