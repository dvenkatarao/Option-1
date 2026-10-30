"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react";

type SchwabStatus = {
  configured: boolean;
  connected: boolean;
  reauthRequired: boolean;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  setupMessage: string | null;
};

type ChainTest = {
  symbol: string;
  source: string;
  underlyingPrice: number | null;
  isDelayed: boolean | null;
  contractCount: number;
  fetchedAt: string;
  contracts: Array<{ symbol: string; expiration: string; strike: number; bid: number | null; ask: number | null; iv: number | null; delta: number | null; quoteTimestamp: string | null }>;
};

async function readStatus(): Promise<SchwabStatus> {
  const response = await fetch("/api/schwab/status", { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Schwab status is unavailable.");
  return body as SchwabStatus;
}

function timeLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : null;
}

export function SchwabMarketDataControl() {
  const [status, setStatus] = useState<SchwabStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ChainTest | null>(null);
  const [callbackResult, setCallbackResult] = useState<"connected" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await readStatus());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Schwab status is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const connectionResult = new URLSearchParams(window.location.search).get("schwab");
    const feedbackTimer = connectionResult === "connected" || connectionResult === "error"
      ? window.setTimeout(() => { if (active) setCallbackResult(connectionResult); }, 0)
      : null;
    if (connectionResult) {
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, "", cleanUrl);
    }
    void readStatus()
      .then((nextStatus) => { if (active) { setStatus(nextStatus); setError(null); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Schwab status is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (feedbackTimer != null) window.clearTimeout(feedbackTimer); };
  }, []);

  const testChain = async () => {
    setTesting(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const response = await fetch("/api/schwab/test-chain?symbol=SPY", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Schwab chain check failed.");
      const result = body as ChainTest;
      setTestResult(result);
      setNotice(result.contractCount > 0
        ? "Schwab options-chain request succeeded. Check the provider entitlement and quote timestamps before relying on freshness."
        : "Schwab request completed but returned no SPY puts in the test window; review the endpoint parameters and market-data entitlement.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Schwab chain check failed.");
      const nextStatus = await readStatus().catch(() => null);
      if (nextStatus) setStatus(nextStatus);
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setError(null);
    setNotice(null);
    setTestResult(null);
    try {
      const response = await fetch("/api/schwab/disconnect", { method: "POST", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Schwab could not be disconnected.");
      setNotice("Local Schwab tokens removed. This app did not revoke consent at Schwab.");
      await loadStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Schwab could not be disconnected.");
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = status?.connected && !status.reauthRequired;
  const expiry = timeLabel(status?.accessTokenExpiresAt ?? null);
  const refreshExpiry = timeLabel(status?.refreshTokenExpiresAt ?? null);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-[10px]">
      <span className={`inline-flex items-center gap-1.5 font-semibold ${connected ? "text-emerald-300" : status?.reauthRequired ? "text-amber-200" : "text-slate-400"}`}>
        <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
        Schwab {loading ? "status…" : connected ? "connected" : status?.reauthRequired ? "reconnect required" : "not connected"}
      </span>
      {connected && expiry && <span className="text-slate-500">Access token expires {expiry}</span>}
      {connected && refreshExpiry && <span className="text-slate-500">Provider-reported refresh expiry {refreshExpiry}</span>}
      {!loading && status?.configured && !connected && (
        <a href="/api/schwab/connect" className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 font-bold text-slate-950 hover:bg-emerald-500">
          <Link2 aria-hidden="true" className="h-3 w-3" />Connect
        </a>
      )}
      {connected && (
        <button type="button" onClick={() => void testChain()} disabled={testing || disconnecting} className="inline-flex items-center gap-1 rounded-md border border-emerald-800/80 px-2.5 py-1.5 font-semibold text-emerald-200 hover:bg-emerald-950/60 disabled:opacity-50">
          {testing ? <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" /> : <Link2 aria-hidden="true" className="h-3 w-3" />}
          {testing ? "Checking SPY…" : "Test SPY chain"}
        </button>
      )}
      {connected && (
        <button type="button" onClick={() => void disconnect()} disabled={disconnecting || testing} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-semibold text-slate-300 hover:text-white disabled:opacity-50">
          {disconnecting ? <RefreshCw aria-hidden="true" className="h-3 w-3 animate-spin" /> : <Unlink aria-hidden="true" className="h-3 w-3" />}
          Disconnect
        </button>
      )}
      {!loading && !status?.configured && <span className="max-w-sm text-slate-500">Set Schwab OAuth values and a strong encryption key on the server.</span>}
      {status?.setupMessage && status.configured && !connected && <span className="max-w-sm text-amber-200/80">{status.setupMessage}</span>}
      {testResult && (
        <div className="basis-full rounded-md border border-emerald-900/70 bg-emerald-950/30 p-2 text-slate-300" role="status">
          <p className="font-semibold text-emerald-200">{testResult.symbol} Schwab put chain · {testResult.contractCount} contracts · underlying {testResult.underlyingPrice == null ? "not returned" : `$${testResult.underlyingPrice.toFixed(2)}`} · request {timeLabel(testResult.fetchedAt) ?? "time unavailable"} · {testResult.isDelayed == null ? "provider delay flag unavailable" : testResult.isDelayed ? "provider flagged delayed" : "not marked delayed; entitlement still unverified"}</p>
          {testResult.contracts.length > 0 && <p className="mt-1 text-slate-400">Sample: {testResult.contracts.slice(0, 3).map((contract) => `${contract.expiration} $${contract.strike} (bid ${contract.bid ?? "—"} / ask ${contract.ask ?? "—"}; IV ${contract.iv == null ? "—" : `${(contract.iv * 100).toFixed(1)}%`}; quote ${timeLabel(contract.quoteTimestamp) ?? "time unavailable"})`).join(" · ")}</p>}
        </div>
      )}
      {callbackResult === "connected" && <span role="status" className="basis-full text-emerald-200/80">Schwab authorization succeeded. Confirm the connection status, then run the SPY chain check.</span>}
      {callbackResult === "error" && <span role="alert" className="basis-full text-amber-200">Schwab authorization did not complete. Review the callback URL and server setup, then try again.</span>}
      {notice && <span role="status" className="basis-full text-emerald-200/80">{notice}</span>}
      {error && <span role="alert" className="basis-full text-amber-200">{error}</span>}
    </div>
  );
}
