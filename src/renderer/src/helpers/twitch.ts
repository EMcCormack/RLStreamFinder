export function formatThumbnailUrl(thumbnailUrl, width = 640, height = 360) {
  if (!thumbnailUrl) {
    return "";
  }

  return thumbnailUrl
    .replace("{width}", String(width))
    .replace("{height}", String(height));
}

export function buildTwitchEmbedUrl(login) {
  const url = new URL("https://player.twitch.tv/");
  url.searchParams.set("channel", login);
  url.searchParams.set("parent", "localhost");
  url.searchParams.set("autoplay", "false");
  url.searchParams.set("muted", "true");
  return url.toString();
}

export function getTwitchLookupStatus(result) {
  if (!result) {
    return { label: "", live: false, pending: true };
  }

  if (!result.matchedLogin) {
    return { label: "No channel", live: false, pending: false };
  }

  return {
    label: result.isLive ? "Live" : "Offline",
    live: result.isLive,
    pending: false,
  };
}
