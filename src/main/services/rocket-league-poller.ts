export class RocketLeagueConnectionPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private attempt: Promise<void> | null = null;

  constructor(
    private readonly isConnected: () => boolean,
    private readonly connect: () => Promise<void>,
    private readonly onConnected: () => void,
    private readonly onPollError: (error: unknown) => void,
    private readonly intervalMs = 5000,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.connectNow().catch(this.onPollError);
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  connectNow(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    if (this.attempt) return this.attempt;

    const attempt = this.connect().then(() => {
      if (this.timer && this.isConnected()) this.onConnected();
    });
    this.attempt = attempt;
    const clearAttempt = () => {
      if (this.attempt === attempt) this.attempt = null;
    };
    void attempt.then(clearAttempt, clearAttempt);
    return attempt;
  }
}
