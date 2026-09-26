import { buildPlayerCandidate, buildSearchQueries } from "./players";

function scoreMatch(candidate, channel) {
  const login = channel.broadcasterLogin.toLowerCase();

  if (login === candidate.loginCandidate) {
    return { confidence: 1.0, reason: "exact login match" };
  }

  if (login === candidate.cleanedLoginCandidate) {
    return { confidence: 0.96, reason: "exact cleaned login match" };
  }

  return null;
}

async function findBestChannel(twitchClient, candidate) {
  let bestChannel = null;
  let bestConfidence = 0;
  let bestReason = "no exact twitch match";

  const queries = candidate.hasTtvHint
    ? buildSearchQueries(candidate)
    : [candidate.loginCandidate];
  for (const query of queries.filter(Boolean)) {
    const liveStream = await twitchClient.getLiveStreamByLogin(query);
    if (liveStream) {
      const scored = scoreMatch(candidate, liveStream);
      const confidence = scored ? Math.min(1, scored.confidence + 0.05) : 0;
      if (scored && confidence > bestConfidence) {
        bestChannel = liveStream;
        bestConfidence = confidence;
        bestReason = `${scored.reason}; exact live stream lookup`;
      }
    }

    const directUser = await twitchClient.getUserByLogin(query);
    if (directUser) {
      const scored = scoreMatch(candidate, directUser);
      if (scored && scored.confidence > bestConfidence) {
        bestChannel = directUser;
        bestConfidence = scored.confidence;
        bestReason = scored.reason;
      }
    }
  }

  let followerCount = null;
  if (bestChannel?.broadcasterId && twitchClient.getFollowerCount) {
    try {
      followerCount = await twitchClient.getFollowerCount(bestChannel.broadcasterId);
    } catch {
      // A failed count lookup should not hide a matched channel or its live status.
    }
  }

  return {
    playerName: candidate.rawName,
    hasTtvHint: candidate.hasTtvHint,
    lookupAttempted: true,
    matchedLogin: bestChannel?.broadcasterLogin ?? null,
    displayName: bestChannel?.displayName ?? null,
    isLive: bestChannel?.isLive ?? false,
    viewerCount: bestChannel?.isLive ? bestChannel.viewerCount ?? null : null,
    followerCount,
    title: bestChannel?.title ?? "",
    gameName: bestChannel?.gameName ?? "",
    thumbnailUrl: bestChannel?.thumbnailUrl ?? null,
    confidence: Number(bestConfidence.toFixed(2)),
    reason: bestReason,
    url: bestChannel?.url ?? null,
  };
}

export async function checkPlayers(twitchClient, playerNames) {
  const results = [];

  for (const playerName of playerNames) {
    const candidate = buildPlayerCandidate(playerName);
    results.push(await findBestChannel(twitchClient, candidate));
  }

  return results;
}
