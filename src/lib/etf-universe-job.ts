import { automaticEtfDiscoveryEnabled, refreshEtfUniverse, ETF_UNIVERSE_TTL_SECONDS } from "./etf-universe-discovery";
import { refreshBatch } from "./etf-service";

const STARTUP_DELAY_MS = 60_000;
const HYDRATION_INTERVAL_MS = 15 * 60_000;
const DISCOVERY_RETRY_DELAY_MS = 6 * 60 * 60_000;
const HYDRATION_BATCH_SIZE = 8;
const HYDRATION_CONCURRENCY = 4;

const globalState = globalThis as typeof globalThis & { __etfUniverseJobStarted?: boolean };

/**
 * In production, refresh the vendor ETF listing daily (via the cached snapshot) and
 * hydrate no more than eight stale funds every 15 minutes. Discovery requires
 * POLYGON_API_KEY; setting ETF_UNIVERSE_DISCOVERY=false disables this job.
 */
export function startEtfUniverseJob() {
  if (!automaticEtfDiscoveryEnabled() || globalState.__etfUniverseJobStarted) return;
  globalState.__etfUniverseJobStarted = true;
  let busy = false;
  let nextDiscoveryAttemptAt = 0;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (Date.now() >= nextDiscoveryAttemptAt) {
        try {
          const discovery = await refreshEtfUniverse();
          if (discovery.stale) {
            nextDiscoveryAttemptAt = Date.now() + DISCOVERY_RETRY_DELAY_MS;
            console.warn("[etf-universe] provider unavailable; using the last successful listing snapshot and retrying discovery later");
          } else {
            nextDiscoveryAttemptAt = Date.parse(discovery.fetchedAt) + ETF_UNIVERSE_TTL_SECONDS * 1000;
          }
        } catch (error) {
          nextDiscoveryAttemptAt = Date.now() + DISCOVERY_RETRY_DELAY_MS;
          console.error("[etf-universe] listing discovery failed; retrying after backoff:", error instanceof Error ? error.message : String(error));
        }
      }

      try {
        const batch = await refreshBatch(HYDRATION_BATCH_SIZE, HYDRATION_CONCURRENCY);
        if (batch.processed.length) {
          const hydrated = batch.processed.filter((item) => item.ok).length;
          console.info(`[etf-universe] hydrated ${hydrated}/${batch.processed.length}; ${batch.remaining} stale ETFs remain`);
        }
      } catch (error) {
        console.error("[etf-universe] background hydration failed:", error instanceof Error ? error.message : String(error));
      }
    } finally {
      busy = false;
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), HYDRATION_INTERVAL_MS).unref?.();
  }, STARTUP_DELAY_MS).unref?.();
}
