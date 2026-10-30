import { isValidTicker } from "./universe";

export type LiveStockSearchProfile = {
  ticker: string;
  name: string | null;
  sector: string | null;
  grade: string | null;
  refreshedAt: string | null;
  lastError?: string | null;
};

function matchRank(profile: LiveStockSearchProfile, query: string): number | null {
  const ticker = profile.ticker.toLocaleUpperCase("en-US");
  const name = profile.name?.toLocaleLowerCase("en-US") ?? "";
  const tickerQuery = query.toLocaleUpperCase("en-US");
  const nameQuery = query.toLocaleLowerCase("en-US");

  if (ticker === tickerQuery) return 0;
  if (query.length < 2) return null;
  if (name === nameQuery) return 1;
  if (ticker.startsWith(tickerQuery)) return 2;
  if (name.startsWith(nameQuery)) return 3;
  if (ticker.includes(tickerQuery)) return 4;
  if (name.includes(nameQuery)) return 5;
  return null;
}

/** Match only hydrated provider-backed stock profiles; never fills gaps from demo data. */
export function searchLiveStockProfiles(
  profiles: LiveStockSearchProfile[],
  query: string,
  limit = 8,
): LiveStockSearchProfile[] {
  const normalized = query.trim();
  if (!normalized || !Number.isFinite(limit) || limit <= 0) return [];

  return profiles
    .map((profile) => ({ profile, rank: matchRank(profile, normalized) }))
    .filter((item): item is { profile: LiveStockSearchProfile; rank: number } => item.rank != null)
    .sort((a, b) => a.rank - b.rank || a.profile.ticker.localeCompare(b.profile.ticker))
    .slice(0, Math.floor(limit))
    .map(({ profile }) => profile);
}


/** Offer refresh only for a valid, exact ticker in the configured wheel universe. */
export function getLiveTickerHydrationCandidate(
  query: string,
  profiles: Pick<LiveStockSearchProfile, "ticker">[],
  universe: string[],
): { ticker: string; canHydrate: true } | null {
  const normalizedQuery = query.trim();
  const ticker = normalizedQuery.toUpperCase();
  const alreadyHydrated = profiles.some((profile) => profile.ticker.toUpperCase() === ticker);
  if (!normalizedQuery || /\s/.test(normalizedQuery) || alreadyHydrated || !isValidTicker(ticker) || !universe.includes(ticker)) return null;
  return { ticker, canHydrate: true };
}
