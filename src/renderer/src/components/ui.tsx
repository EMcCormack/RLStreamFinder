import type { ButtonHTMLAttributes, ReactNode } from "react";

type DotState = "online" | "offline" | "idle";

type StatusCardProps = {
  dotState?: DotState;
  label: string;
  value: ReactNode;
  stat?: string;
};

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "small";
};

type PillProps = {
  live?: boolean;
  pending?: boolean;
  children: ReactNode;
};

export function StatusDot({ state }) {
  const colors = {
    online: "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]",
    offline: "bg-rose-400 shadow-[0_0_0_4px_rgba(251,113,133,0.10)]",
    idle: "bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.12)]",
  };

  return <span className={`h-3 w-3 shrink-0 rounded-full ${colors[state] ?? "bg-slate-500"}`} />;
}

export function StatusCard({ dotState = "idle", label, value, stat }: StatusCardProps) {
  return (
    <section className="flex min-h-[72px] items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/92 p-4">
      {stat ? (
        <span className="min-w-10 text-3xl font-black leading-none text-teal-300">{stat}</span>
      ) : (
        <StatusDot state={dotState} />
      )}
      <div className="min-w-0">
        <p className="mb-1 text-xs font-black uppercase text-slate-400">{label}</p>
        <p className="break-words text-sm text-slate-50">{value}</p>
      </div>
    </section>
  );
}

export function ActionButton({ variant = "primary", size = "default", className = "", ...props }: ActionButtonProps) {
  const variants = {
    primary: "border-transparent bg-teal-400 text-slate-950 hover:brightness-110",
    secondary: "border-slate-700 bg-slate-800 text-slate-50 hover:brightness-110",
    ghost: "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-100",
  };

  return (
    <button
      className={`${size === "small" ? "min-h-8 px-2.5 text-xs" : "min-h-10 px-4 text-sm"} rounded-md border font-extrabold disabled:cursor-progress disabled:opacity-55 ${variants[variant]} ${className}`}
      type="button"
      {...props}
    />
  );
}

export function Pill({ live, pending, children }: PillProps) {
  let classes = "bg-slate-700 text-slate-400";
  if (live) {
    classes = "bg-emerald-400 text-emerald-950";
  } else if (pending) {
    classes = "bg-amber-400 text-amber-950";
  }

  return (
    <span className={`inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs font-black ${classes}`}>
      {children}
    </span>
  );
}

export function EmptyState({ children }) {
  return (
    <p className="rounded-md border border-dashed border-slate-700 bg-white/[0.025] p-4 text-slate-400">
      {children}
    </p>
  );
}
