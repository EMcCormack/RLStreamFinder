export function AuthNotice({ authFlow }) {
  if (!authFlow) {
    return null;
  }

  return (
    <section className="mb-3 rounded-lg border border-teal-400/40 bg-teal-400/10 p-4">
      <p className="mb-1 font-black">Twitch Sign-In</p>
      <p className="text-slate-400">
        Open <a className="text-sky-300 hover:underline" href={authFlow.verificationUri} rel="noreferrer" target="_blank">{authFlow.verificationUri}</a> and enter code <strong className="text-slate-50">{authFlow.userCode}</strong>.
      </p>
    </section>
  );
}
