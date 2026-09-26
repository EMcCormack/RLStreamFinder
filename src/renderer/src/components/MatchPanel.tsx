import { getTwitchLookupStatus } from "../helpers/twitch.ts";
import { EmptyState, Pill } from "./ui.tsx";

function PlayerRow({ player, result }) {
  const twitchStatus = getTwitchLookupStatus(result);

  return (
    <article className={`flex min-h-16 items-center justify-between gap-3 rounded-md border px-3 py-2.5 ${player.isCurrentPlayer ? "border-teal-300 bg-teal-300/15 shadow-[inset_4px_0_0_#5eead4]" : "border-slate-700 bg-slate-700/55"}`}>
      <h4 className="truncate text-sm font-extrabold">{player.isCurrentPlayer ? "You" : player.Name}</h4>
      <div className="flex min-w-[118px] items-center justify-end gap-2 text-right">
        {result?.matchedLogin ? (
          <>
            <a className="max-w-[150px] truncate text-sky-300 hover:underline" href={result.url} rel="noreferrer" target="_blank">
              {result.matchedLogin}
            </a>
            <Pill live={twitchStatus.live}>{twitchStatus.label}</Pill>
          </>
        ) : twitchStatus.label ? (
          <Pill pending={twitchStatus.pending}>{twitchStatus.label}</Pill>
        ) : null}
      </div>
    </article>
  );
}

function TeamColumn({ accent, name, players, results }) {
  return (
    <section className="min-h-[420px] overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
      <header className={`flex h-[54px] items-center border-b border-slate-700 px-4 shadow-[inset_4px_0_0_var(--team-accent)] ${accent}`}>
        <h3 className="text-base font-extrabold">{name}</h3>
      </header>
      <div className="grid gap-2 p-2.5">
        {players.length ? (
          players.map((player) => (
            <PlayerRow
              key={`${player.PrimaryId ?? player.Name}-${player.TeamNum}`}
              player={player}
              result={results.find((item) => item.playerName === player.Name)}
            />
          ))
        ) : (
          <EmptyState>No {name.toLowerCase()} team data yet.</EmptyState>
        )}
      </div>
    </section>
  );
}

export function MatchPanel({ results, snapshot }) {
  const players = snapshot?.players ?? [];
  const teams = snapshot?.teams ?? [];
  const blue = teams.find((team) => team.TeamNum === 0);
  const orange = teams.find((team) => team.TeamNum === 1);
  const bluePlayers = players.filter((player) => player.TeamNum === 0);
  const orangePlayers = players.filter((player) => player.TeamNum === 1);
  const otherPlayers = players.filter((player) => player.TeamNum !== 0 && player.TeamNum !== 1);

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-900/92 p-4 shadow-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-black">Current Players</h2>
        <p className="text-sm text-slate-400">{snapshot ? "Checking the live roster for Twitch channels." : "Connect to Rocket League to see the live roster."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <TeamColumn accent="[--team-accent:#2c7dfa]" name={blue?.Name || "Blue"} players={bluePlayers} results={results} />
        <TeamColumn accent="[--team-accent:#f08a35]" name={orange?.Name || "Orange"} players={orangePlayers} results={results} />
      </div>

      {otherPlayers.length ? (
        <section className="mt-3">
          <h3 className="mb-2 text-base font-black">Other Players</h3>
          <div className="grid gap-2">
            {otherPlayers.map((player) => (
              <PlayerRow
                key={`${player.PrimaryId ?? player.Name}-${player.TeamNum}`}
                player={player}
                result={results.find((item) => item.playerName === player.Name)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
