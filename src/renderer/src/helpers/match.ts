export function getCurrentPlayerNames(snapshot) {
  return new Set((snapshot?.players ?? [])
    .filter((player) => player?.isCurrentPlayer)
    .map((player) => player.Name?.trim().toLowerCase())
    .filter(Boolean));
}

export function getScannablePlayerNames(snapshot) {
  const currentPlayerNames = getCurrentPlayerNames(snapshot);
  if (!currentPlayerNames.size) {
    return [];
  }

  return (snapshot?.playerNames ?? []).filter((name) =>
    typeof name === "string" && !currentPlayerNames.has(name.trim().toLowerCase()));
}

export function buildRosterKey(snapshot) {
  return getScannablePlayerNames(snapshot).slice().sort((a, b) => a.localeCompare(b)).join("\n");
}
