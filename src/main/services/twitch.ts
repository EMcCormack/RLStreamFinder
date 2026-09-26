import * as fs from "node:fs";
import * as path from "node:path";
import { ApiClient } from "@twurple/api";
import {
  exchangeDeviceCode,
  RefreshingAuthProvider,
  type AccessToken,
} from "@twurple/auth";

const LIVE_LOOKUP_CACHE_MS = 30 * 1000;
const USER_LOOKUP_CACHE_MS = 5 * 60 * 1000;
const lookupCache = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();

export class TwitchApiError extends Error {
  status: unknown;
  details: unknown;

  constructor(message: string, { status, details }: { status?: unknown; details?: unknown } = {}) {
    super(message);
    this.name = "TwitchApiError";
    this.status = status ?? null;
    this.details = details ?? null;
  }
}

export class TwitchAuthRequiredError extends Error {
  constructor(message = "Twitch sign-in required.") {
    super(message);
    this.name = "TwitchAuthRequiredError";
  }
}

type TokenCodec = {
  encode(tokenState: AccessToken): string;
  decode(rawPayload: string): AccessToken;
};

type DeviceCodeFlow = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
};

export class TwitchClient {
  private readonly clientId: string;
  private readonly scopes: string[];
  private readonly tokenStorePath: string;
  private readonly tokenCodec: TokenCodec;
  private readonly authProvider: RefreshingAuthProvider;
  private readonly api: ApiClient;
  private initialized = false;
  private initialization?: Promise<void>;
  private authenticatedUserId?: string;

  constructor({
    clientId,
    scopes = [],
    tokenStorePath,
    tokenCodec,
  }: {
    clientId: string;
    scopes?: string[];
    tokenStorePath: string;
    tokenCodec: TokenCodec;
  }) {
    this.clientId = clientId;
    this.scopes = scopes;
    this.tokenStorePath = tokenStorePath;
    this.tokenCodec = tokenCodec;
    this.authProvider = new RefreshingAuthProvider({ clientId });
    this.authProvider.onRefresh((_userId, token) => this.writeStoredToken(token));
    this.api = new ApiClient({ authProvider: this.authProvider });
  }

  private readStoredToken(): AccessToken | null {
    if (!fs.existsSync(this.tokenStorePath)) return null;

    const token = this.tokenCodec.decode(fs.readFileSync(this.tokenStorePath, "utf8")) as AccessToken & {
      expiresAt?: number;
      obtainedAt?: string;
    };

    // Migrate the token shape written by the viewer before Twurple handled auth.
    if (token.expiresIn === undefined && token.expiresAt !== undefined) {
      const obtainmentTimestamp = token.obtainedAt
        ? Date.parse(token.obtainedAt)
        : Date.now();
      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        scope: token.scope ?? [],
        expiresIn: Math.max(0, Math.floor((token.expiresAt - obtainmentTimestamp) / 1000) + 60),
        obtainmentTimestamp,
      };
    }

    return token;
  }

  private writeStoredToken(token: AccessToken): void {
    fs.mkdirSync(path.dirname(this.tokenStorePath), { recursive: true });
    fs.writeFileSync(this.tokenStorePath, this.tokenCodec.encode(token), "utf8");
  }

  private clearStoredToken(): void {
    if (fs.existsSync(this.tokenStorePath)) {
      fs.unlinkSync(this.tokenStorePath);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initialization) return this.initialization;

    this.initialization = (async () => {
      const storedToken = this.readStoredToken();
      if (!storedToken) return;
      try {
        this.authenticatedUserId = await this.authProvider.addUserForToken(storedToken);
        this.initialized = true;
      } catch (error) {
        if (error instanceof Error && error.name === "InvalidTokenError") {
          this.clearStoredToken();
          throw new TwitchAuthRequiredError("Stored Twitch token is invalid. Connect Twitch again.");
        }
        throw error;
      }
    })().finally(() => {
      this.initialization = undefined;
    });
    return this.initialization;
  }

  private async getAuthenticatedUserId(): Promise<string> {
    await this.ensureInitialized();
    if (!this.authenticatedUserId) {
      throw new TwitchAuthRequiredError("No Twitch login found. Connect Twitch in the app.");
    }

    const tokenInfo = await this.api.asUser(this.authenticatedUserId, (context) => context.getTokenInfo());
    if (tokenInfo.clientId !== this.clientId || !tokenInfo.userId) {
      this.clearStoredToken();
      throw new TwitchAuthRequiredError("Stored Twitch token belongs to a different Twitch account.");
    }

    return tokenInfo.userId;
  }

  private async getCachedLookup<T>(cacheKey: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = lookupCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.promise as Promise<T>;
    }

    const promise = Promise.resolve()
      .then(loader)
      .catch((error) => {
        lookupCache.delete(cacheKey);
        throw error;
      });

    lookupCache.set(cacheKey, { expiresAt: now + ttlMs, promise });
    return promise;
  }

  async startDeviceCodeFlow(): Promise<DeviceCodeFlow> {
    const flow = await this.authProvider.startDeviceCodeFlow(this.scopes);
    return {
      deviceCode: flow.deviceCode,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      expiresInSeconds: flow.expiresIn,
      intervalSeconds: flow.interval,
    };
  }

  async pollForDeviceCodeAccessToken({
    deviceCode,
    intervalSeconds,
    expiresInSeconds,
  }: DeviceCodeFlow): Promise<AccessToken> {
    const deadline = Date.now() + expiresInSeconds * 1000;
    let waitMs = intervalSeconds * 1000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      try {
        const token = await exchangeDeviceCode(this.clientId, deviceCode, this.scopes);
        this.authenticatedUserId = await this.authProvider.addUserForToken(token);
        this.writeStoredToken(token);
        this.initialized = true;
        return token;
      } catch (error) {
        let details: { error?: string; message?: string } | undefined;
        const body = (error as { body?: string })?.body;
        if (body) {
          try {
            details = JSON.parse(body);
          } catch {
            details = undefined;
          }
        }

        const errorCode = details?.message ?? details?.error;

        if (errorCode === "authorization_pending") {
          continue;
        }

        if (errorCode === "slow_down") {
          waitMs += 5000;
          continue;
        }

        if (errorCode === "access_denied") {
          throw new TwitchApiError("Twitch sign-in was denied.", { details });
        }

        if (errorCode === "expired_token") {
          throw new TwitchApiError("Twitch device code expired before authorization completed.", { details });
        }

        throw error;
      }
    }

    throw new TwitchApiError("Twitch sign-in timed out before authorization completed.");
  }

  async verifyCredentials() {
    await this.ensureInitialized();
    const userId = await this.getAuthenticatedUserId();
    const tokenInfo = await this.api.asUser(userId, (context) => context.getTokenInfo());

    return {
      clientId: tokenInfo.clientId,
      userId,
      login: tokenInfo.userName,
      expiresInSeconds: tokenInfo.expiryDate
        ? Math.max(0, Math.floor((tokenInfo.expiryDate.getTime() - Date.now()) / 1000))
        : null,
      scopes: tokenInfo.scopes,
      tokenPath: this.tokenStorePath,
    };
  }

  async getUserByLogin(login: string) {
    const normalizedLogin = String(login).toLowerCase();
    return this.getCachedLookup(`user:${normalizedLogin}`, USER_LOOKUP_CACHE_MS, async () => {
      const userId = await this.getAuthenticatedUserId();
      const user = await this.api.asUser(userId, (context) => context.users.getUserByName(normalizedLogin));
      if (!user) {
        return null;
      }

      return {
        broadcasterLogin: user.name,
        broadcasterId: user.id,
        displayName: user.displayName,
        isLive: false,
        title: "",
        gameName: "",
        thumbnailUrl: null,
        url: `https://www.twitch.tv/${user.name}`,
      };
    });
  }

  async getLiveStreamByLogin(login: string) {
    const normalizedLogin = String(login).toLowerCase();
    return this.getCachedLookup(`live:${normalizedLogin}`, LIVE_LOOKUP_CACHE_MS, async () => {
      const userId = await this.getAuthenticatedUserId();
      const stream = await this.api.asUser(userId, (context) => context.streams.getStreamByUserName(normalizedLogin));
      if (!stream) {
        return null;
      }

      return {
        broadcasterLogin: stream.userName,
        broadcasterId: stream.userId,
        displayName: stream.userDisplayName,
        isLive: true,
        viewerCount: stream.viewers,
        title: stream.title ?? "",
        gameName: stream.gameName ?? "",
        thumbnailUrl: stream.thumbnailUrl ?? null,
        url: `https://www.twitch.tv/${stream.userName}`,
      };
    });
  }

  async getFollowerCount(broadcasterId: string): Promise<number> {
    return this.getCachedLookup(`followers:${broadcasterId}`, USER_LOOKUP_CACHE_MS, async () => {
      const userId = await this.getAuthenticatedUserId();
      return this.api.asUser(userId, (context) => context.channels.getChannelFollowerCount(broadcasterId));
    });
  }

  async searchChannels(query: string, { liveOnly = false }: { liveOnly?: boolean } = {}) {
    const userId = await this.getAuthenticatedUserId();
    const result = await this.api.asUser(userId, (context) =>
      context.search.searchChannels(query, { liveOnly, limit: 10 }),
    );
    return result.data.map((channel) => ({
      broadcasterLogin: channel.name,
      displayName: channel.displayName,
      isLive: channel.isLive,
      title: "",
      gameName: channel.gameName ?? "",
      thumbnailUrl: channel.thumbnailUrl ?? null,
      url: `https://www.twitch.tv/${channel.name}`,
    }));
  }

  async debugLookup(login: string) {
    const normalizedLogin = String(login).trim().toLowerCase();
    if (!normalizedLogin) {
      throw new Error("A Twitch username is required.");
    }

    const startedAt = Date.now();
    const authenticatedUserId = await this.getAuthenticatedUserId();
    const user = await this.api.asUser(authenticatedUserId, (context) =>
      context.users.getUserByName(normalizedLogin),
    );
    const stream = await this.api.asUser(authenticatedUserId, (context) =>
      context.streams.getStreamByUserName(normalizedLogin),
    );

    return {
      authenticatedUserId,
      requestedLogin: normalizedLogin,
      user: user
        ? {
            id: user.id,
            login: user.name,
            displayName: user.displayName,
          }
        : null,
      stream: stream
        ? {
            login: stream.userName,
            displayName: stream.userDisplayName,
            live: true,
            title: stream.title,
            gameName: stream.gameName,
          }
        : null,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
