"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, RefreshCw, X } from "lucide-react";

const cash = (value: number | null | undefined) => value == null || !Number.isFinite(value)
  ? "N/A"
  : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not available";

type PreviewResponse = {
  stock: {
    ticker: string;
    name: string | null;
    sector: string | null;
    marketCap: number | null;
    storedPrice: number | null;
    fundamentals: Record<string, unknown> | null;
    technicals: Record<string, unknown> | null;
    grade: string | null;
    events: { nextEarnings: string | null; earningsEstimated?: boolean } | null;
    refreshedAt: string | null;
    lastError: string | null;
  };
  quote: { price: number | null; change: number | null; changePct: number | null; marketState?: string } | null;
  quoteFetchedAt: string | null;
  quoteStale: boolean;
  quoteSource: string;
};

type RequestError = Error & { status?: number };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`) as RequestError;
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export function LiveStockSearchPreview({
  ticker,
  canHydrate,
  onClose,
  onOpenDetail,
}: {
  ticker: string;
  canHydrate: boolean;
  onClose: () => void;
  onOpenDetail: (ticker: string) => void;
}) {
  const [profile, setProfile] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsHydration, setNeedsHydration] = useState(false);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    setNeedsHydration(false);
    try {
      const response = await fetch(`/api/wheel/stocks/${encodeURIComponent(ticker)}`, { cache: "no-store", signal });
      const result = await readJson<PreviewResponse>(response);
      if (!signal?.aborted) {
        setProfile(result);
        setNeedsHydration(canHydrate && (!result.stock.fundamentals || !result.stock.technicals));
      }
    } catch (reason) {
      if (!signal?.aborted) {
        const requestError = reason as RequestError;
        setProfile(null);
        setError(reason instanceof Error ? reason.message : "Live stock profile could not be loaded");
        setNeedsHydration(canHydrate && requestError.status === 404);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [ticker, canHydrate]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadProfile(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadProfile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const hydrateProfile = async () => {
    setHydrating(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/wheel/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      const result = await readJson<{ ok: boolean; error?: string }>(response);
      if (!result.ok) throw new Error(result.error ?? `Live profile refresh failed for ${ticker}`);
      await loadProfile();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Live profile refresh failed");
      setLoading(false);
    } finally {
      setHydrating(false);
    }
  };

  const quotePrice = profile?.quote?.price ?? profile?.stock.storedPrice ?? null;
  const quoteChangePct = profile?.quote?.changePct;
  const profileComplete = Boolean(profile?.stock.fundamentals && profile.stock.technicals);

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section role="dialog" aria-modal="true" aria-label={`${ticker} live stock preview`} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-extrabold text-white">{ticker}</h2>
              {profile?.stock.grade && <span title="Grade is a WheelCore heuristic based on stored provider fundamentals." className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">Grade {profile.stock.grade}</span>}
              {profile?.quoteStale && <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">Stale quote</span>}
            </div>
            <p className="mt-1 text-xs text-slate-400">{profile?.stock.name ?? (loading ? "Loading live profile…" : "Live stock profile")}{profile?.stock.sector ? ` · ${profile.stock.sector}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close live stock preview" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-4 sm:p-6">
          {loading ? (
            <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
              <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin text-cyan-300" />Loading provider-backed stock data…</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2 text-xs leading-relaxed text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>
              {needsHydration ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[10px] leading-relaxed text-slate-400">This ticker is in the configured live wheel universe but does not have a stored profile yet.</p>
                  <button type="button" onClick={() => void hydrateProfile()} disabled={hydrating} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${hydrating ? "animate-spin" : ""}`} />{hydrating ? "Fetching live profile…" : "Fetch live profile"}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void loadProfile()} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:text-white">Retry live lookup</button>
              )}
            </div>
          ) : profile ? (
            <>
              {!profileComplete && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-[10px] leading-relaxed text-amber-100">The stored provider record is incomplete. No sample stock data is being substituted.</p>
                  {canHydrate && <button type="button" onClick={() => void hydrateProfile()} disabled={hydrating} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-emerald-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${hydrating ? "animate-spin" : ""}`} />{hydrating ? "Fetching live profile…" : "Fetch live profile"}</button>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Underlying</div>
                  <div className="mt-1 font-mono text-lg font-bold text-white">{cash(quotePrice)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{profile.quote?.price == null ? (profile.stock.storedPrice == null ? "Quote unavailable" : "Stored close fallback") : profile.quote.marketState ?? "Provider quote"}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Day change</div>
                  <div className={`mt-1 font-mono text-lg font-bold ${quoteChangePct != null && quoteChangePct < 0 ? "text-rose-300" : "text-emerald-300"}`}>{quoteChangePct == null ? "N/A" : `${quoteChangePct.toFixed(2)}%`}</div>
                  <div className="mt-1 text-[10px] text-slate-500">Yahoo percentage points</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Market cap</div>
                  <div className="mt-1 font-mono text-sm font-bold text-slate-200">{cash(profile.stock.marketCap)}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Next earnings</div>
                  <div className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-200"><CalendarClock className="h-3.5 w-3.5 text-amber-300" />{profile.stock.events?.nextEarnings ?? "Unknown"}{profile.stock.events?.earningsEstimated ? " · est." : ""}</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[10px] leading-relaxed text-slate-400">
                <div>Quote source: <b className="text-slate-200">{profile.quote?.price == null ? `No quote price · ${profile.quoteSource}` : profile.quoteSource}</b>{profile.quoteStale ? " · cached/stale" : ""}</div>
                <div>Quote fetched: <b className="text-slate-200">{timestamp(profile.quoteFetchedAt)}</b></div>
                <div>Profile refresh: <b className={profile.stock.lastError ? "text-amber-200" : "text-slate-200"}>{profile.stock.lastError ? `Failed · ${timestamp(profile.stock.refreshedAt)}` : timestamp(profile.stock.refreshedAt)}</b></div>
              </div>

              {profile.stock.lastError && <p className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2 text-[10px] leading-relaxed text-amber-100/80">Latest provider refresh failed; the stored profile values are retained. {profileComplete ? profile.stock.lastError : `Incomplete stored profile: ${profile.stock.lastError}`}</p>}

              <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center">
                <p className="text-[10px] leading-relaxed text-slate-500">Quotes may be delayed. The grade is a WheelCore research heuristic; this preview is not broker-connected and does not place orders.</p>
                {profileComplete ? (
                  <button type="button" onClick={() => onOpenDetail(ticker)} className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">Detail Workspace</button>
                ) : (
                  <span className="max-w-48 text-right text-[10px] leading-relaxed text-slate-500">Detail Workspace needs a complete live stock profile.</span>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
