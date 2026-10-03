import { useEffect, useMemo, useRef, useState } from "react";
import { buildTwitchEmbedUrl, formatThumbnailUrl, getTwitchLookupStatus } from "../helpers/twitch.ts";
import { hasRecentStreamStatus, limitPreviousStreamers, markStreamerDeparture } from "../helpers/streamer-history.ts";
import { getCurrentPlayerNames } from "../helpers/match.ts";
import { ActionButton, EmptyState, Pill } from "./ui.tsx";

const STORAGE_KEY = "rocket-league-viewer:streamers:v1";
const streamerKey = (item) => item.matchedLogin?.toLowerCase() || item.playerName?.toLowerCase();
const isCandidate = (item) => item.isLive || item.hasTtvHint || item.confidence >= 0.7;
const formatCount = (count) => new Intl.NumberFormat().format(count);

function StreamerStats({ item, showViewers = item.isLive }) {
  const stats = [
    Number.isFinite(item.followerCount) ? `${formatCount(item.followerCount)} followers` : null,
    showViewers && Number.isFinite(item.viewerCount) ? `${formatCount(item.viewerCount)} viewers` : null,
  ].filter(Boolean);
  return stats.length ? <p className="text-xs text-slate-400">{stats.join(" · ")}</p> : null;
}

function readSavedStreamers() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { items: Array.isArray(saved.items) ? saved.items.slice(0, 100) : [], dismissed: Array.isArray(saved.dismissed) ? saved.dismissed : [] };
  } catch {
    return { items: [], dismissed: [] };
  }
}

function withLimitedHistory(previous, items, activeNames, dismissed = previous.dismissed) {
  const keptItems = limitPreviousStreamers(items, activeNames, new Set(dismissed));
  const keptKeys = new Set(keptItems.map(streamerKey));
  return { ...previous, items: keptItems, dismissed: dismissed.filter((key) => keptKeys.has(key)) };
}

function StreamPreview({ item, onClose }) {
  if (!item?.matchedLogin) return null;
  return (
    <section className="mb-4 rounded-md border border-teal-400/40 bg-teal-400/10 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-black uppercase text-slate-400">Preview</p>
          <h3 className="text-base font-extrabold">{item.displayName || item.matchedLogin}</h3>
        </div>
        <ActionButton variant="ghost" className="min-h-8 px-3" onClick={onClose}>Close</ActionButton>
      </div>
      <div className="mb-3 aspect-[4/3] min-h-[300px] overflow-hidden rounded-md border border-slate-700 bg-black">
        <iframe allow="autoplay; fullscreen" allowFullScreen className="h-full w-full border-0" referrerPolicy="origin" src={buildTwitchEmbedUrl(item.matchedLogin)} title={`${item.matchedLogin} Twitch preview`} />
      </div>
      <a className="text-sky-300 hover:underline" href={item.url} rel="noreferrer" target="_blank">Open on Twitch</a>
    </section>
  );
}

function StreamerCard({ item, onPreview, onClose }) {
  const thumbnailUrl = formatThumbnailUrl(item.thumbnailUrl);
  const twitchStatus = getTwitchLookupStatus(item);
  return (
    <article className="rounded-md border border-slate-700 bg-slate-700/55 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-extrabold">{item.playerName}</h3>
        </div>
        <div className="flex items-center gap-2">
          {twitchStatus.label ? <Pill live={twitchStatus.live}>{twitchStatus.label}</Pill> : null}
          <button type="button" aria-label={`Close ${item.playerName}`} onClick={onClose} className="text-lg leading-none text-slate-400 hover:text-slate-100">×</button>
        </div>
      </div>
      {item.matchedLogin ? <>
        {item.isLive && thumbnailUrl ? (
          <button className="relative mb-3 block w-full overflow-hidden rounded-md border border-slate-700 bg-black p-0 text-left" type="button" onClick={() => onPreview(item)}>
            <img className="aspect-video w-full object-cover" src={thumbnailUrl} alt={`${item.matchedLogin} stream thumbnail`} loading="lazy" />
            <span className="absolute bottom-2.5 left-2.5 inline-flex min-h-7 items-center rounded-full bg-black/80 px-2.5 text-xs font-black text-slate-50">Play Preview</span>
          </button>
        ) : null}
        <a className="text-sky-300 hover:underline" href={item.url} rel="noreferrer" target="_blank">twitch.tv/{item.matchedLogin}</a>
        <StreamerStats item={item} />
        {item.isLive && item.title ? <p className="mt-2 text-sm text-slate-50">{item.title}</p> : null}
      </> : null}
    </article>
  );
}

export function StreamersPanel({ results, snapshot, status }) {
  const [saved, setSaved] = useState(readSavedStreamers);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState("");
  const [now, setNow] = useState(Date.now);
  const previousActiveNamesRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const candidates = results.filter(isCandidate);
    if (!candidates.length) return;
    setSaved((previous) => {
      const incomingKeys = new Set(candidates.map(streamerKey));
      const activeNames = new Set((snapshot?.players ?? []).map((player) => player?.Name?.trim().toLowerCase()).filter(Boolean));
      const items = [...candidates, ...previous.items.filter((item) => !incomingKeys.has(streamerKey(item)))];
      return withLimitedHistory(previous, items, activeNames);
    });
  }, [results]);

  useEffect(() => {
    const activeNames = new Set<string>((snapshot?.players ?? [])
      .map((player) => player?.Name?.trim().toLowerCase())
      .filter(Boolean));
    const departedNames = new Set<string>([...(previousActiveNamesRef.current ?? [])]
      .filter((name) => !activeNames.has(name)));
    previousActiveNamesRef.current = activeNames;
    const departedAt = Date.now();
    setSaved((previous) => withLimitedHistory(
      previous,
      departedNames.size
        ? markStreamerDeparture(previous.items, departedNames, departedAt, new Set(previous.dismissed))
        : previous.items,
      activeNames,
    ));
    if (departedNames.size) setNow(departedAt);
  }, [snapshot]);

  useEffect(() => {
    const nextExpiry = Math.min(...saved.items
      .map((item) => item.previousStatusExpiresAt)
      .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > now));
    if (!Number.isFinite(nextExpiry)) return;
    const timeout = setTimeout(() => setNow(Date.now()), nextExpiry - now);
    return () => clearTimeout(timeout);
  }, [saved.items, now]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  const dismissed = new Set(saved.dismissed);
  const activePlayerNames = new Set((snapshot?.players ?? []).map((player) => player?.Name?.trim().toLowerCase()).filter(Boolean));
  const isCurrent = (item) => activePlayerNames.has(item.playerName?.trim().toLowerCase()) && !dismissed.has(streamerKey(item));
  const currentPlayerNames = getCurrentPlayerNames(snapshot);
  const visibleItems = saved.items.filter((item) => !currentPlayerNames.has(item.playerName?.trim().toLowerCase()));
  const current = visibleItems.filter(isCurrent);
  const past = visibleItems.filter((item) => !isCurrent(item));
  const selectedPreview = useMemo(() => visibleItems.find((item) => streamerKey(item) === selectedPreviewKey) ?? null, [saved.items, selectedPreviewKey, snapshot]);
  const close = (item) => {
    const key = streamerKey(item);
    const closedAt = Date.now();
    setSaved((previous) => withLimitedHistory(
      previous,
      activePlayerNames.has(item.playerName?.trim().toLowerCase())
        ? markStreamerDeparture(previous.items, new Set([item.playerName.trim().toLowerCase()]), closedAt)
        : previous.items,
      activePlayerNames,
      [...new Set([...previous.dismissed, key])],
    ));
    setNow(closedAt);
    if (selectedPreviewKey === key) setSelectedPreviewKey("");
  };
  const restore = (item) => setSaved((previous) => ({ ...previous, dismissed: previous.dismissed.filter((key) => key !== streamerKey(item)) }));

  return (
    <aside className="rounded-lg border border-slate-700 bg-slate-900/92 p-4 shadow-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-black">Streamers</h2>
        <p className={`text-sm ${status.isError ? "text-rose-300" : "text-slate-400"}`}>{status.message}</p>
      </div>
      <StreamPreview item={selectedPreview} onClose={() => setSelectedPreviewKey("")} />
      <div className="grid gap-2.5">
        {current.length ? current.map((item) => <StreamerCard key={streamerKey(item)} item={item} onPreview={() => setSelectedPreviewKey(streamerKey(item))} onClose={() => close(item)} />)
          : <EmptyState>{past.length ? "No streamers in the current match." : results.length ? "No Twitch channels found." : "No Twitch scan yet."}</EmptyState>}
      </div>
      {past.length ? <section aria-label="Previous Streamers" className="mt-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-600" />
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-400">Previous Streamers</h3>
          <div className="h-px flex-1 bg-slate-600" />
        </div>
        <div className="grid max-h-[22rem] gap-2 overflow-y-auto pr-1" aria-label="Previous streamer list" tabIndex={0}>
          {past.map((item) => {
            const recentStatus = hasRecentStreamStatus(item, now) ? getTwitchLookupStatus(item) : null;
            return <div key={streamerKey(item)} className="flex min-h-16 items-center justify-between gap-2 rounded-md border border-slate-700 bg-slate-800 p-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-bold">{item.playerName}</p>
                {item.matchedLogin ? <a className="truncate text-sky-300 hover:underline" href={item.url} rel="noreferrer" target="_blank">twitch.tv/{item.matchedLogin}</a> : null}
                {item.matchedLogin ? <StreamerStats item={item} showViewers={Boolean(recentStatus?.live)} /> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {recentStatus ? <span title="Last checked status, shown for five minutes"><Pill live={recentStatus.live}>{recentStatus.label}</Pill></span> : null}
                {item.matchedLogin ? <ActionButton size="small" variant="ghost" onClick={() => setSelectedPreviewKey(streamerKey(item))}>Preview</ActionButton> : null}
                {activePlayerNames.has(item.playerName?.trim().toLowerCase()) && dismissed.has(streamerKey(item)) ? <ActionButton size="small" variant="ghost" onClick={() => restore(item)}>Show</ActionButton> : null}
              </div>
            </div>;
          })}
        </div>
      </section> : null}
    </aside>
  );
}
