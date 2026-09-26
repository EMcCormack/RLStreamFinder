import { afterEach, expect, test, vi } from "vitest";
import { RocketLeagueConnectionPoller } from "../src/main/services/rocket-league-poller";

afterEach(() => {
  vi.useRealTimers();
});

test("retries after an unavailable socket and reports a later connection", async () => {
  vi.useFakeTimers();
  let connected = false;
  const connect = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" }))
    .mockImplementation(async () => { connected = true; });
  const onConnected = vi.fn();
  const onPollError = vi.fn();
  const poller = new RocketLeagueConnectionPoller(() => connected, connect, onConnected, onPollError);

  poller.start();
  await expect(poller.connectNow()).rejects.toThrow("Connection refused");
  await vi.advanceTimersByTimeAsync(5000);
  expect(connect).toHaveBeenCalledTimes(2);
  expect(onConnected).toHaveBeenCalledTimes(1);
  expect(onPollError).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(10000);
  expect(connect).toHaveBeenCalledTimes(2);
  poller.stop();
});

test("does not overlap attempts and stops retrying when stopped", async () => {
  vi.useFakeTimers();
  let finishConnect: () => void = () => {};
  const connect = vi.fn(() => new Promise<void>((resolve) => { finishConnect = resolve; }));
  const poller = new RocketLeagueConnectionPoller(() => false, connect, vi.fn(), vi.fn());

  poller.start();
  const firstAttempt = poller.connectNow();
  await vi.advanceTimersByTimeAsync(15000);
  expect(connect).toHaveBeenCalledTimes(1);

  finishConnect();
  await firstAttempt;
  poller.stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(connect).toHaveBeenCalledTimes(1);
});
