import { handle } from "@/lib/api";
import { deriveRegime } from "@/lib/macro-regime";
import { getBlsSchedule, getFomcCalendar, getMacroSnapshot, getPolicyRates, getYieldCurve } from "@/lib/macro";

export const dynamic = "force-dynamic";

/** FRED, NY Fed, Federal Reserve and BLS data used by the Macro → Action workspace. */
export const GET = handle(async () => {
  const [snapshotResult, curveResult, policyResult, fomcResult, blsResult] = await Promise.all([
    getMacroSnapshot(),
    getYieldCurve(),
    getPolicyRates(),
    getFomcCalendar(),
    getBlsSchedule(),
  ]);
  const snapshot = snapshotResult?.data ?? null;
  const curve = curveResult?.data ?? null;
  const policy = policyResult?.data ?? null;

  return Response.json({
    snapshot,
    yieldCurve: curve,
    policyRates: policy,
    fomc: fomcResult?.data ?? null,
    blsReleases: blsResult?.data ?? null,
    regime: deriveRegime({ snap: snapshot, curve, policy }),
    provenance: {
      snapshot: snapshotResult ? { fetchedAt: snapshotResult.fetchedAt, stale: snapshotResult.stale } : null,
      yieldCurve: curveResult ? { fetchedAt: curveResult.fetchedAt, stale: curveResult.stale } : null,
      policyRates: policyResult ? { fetchedAt: policyResult.fetchedAt, stale: policyResult.stale } : null,
      fomc: fomcResult ? { fetchedAt: fomcResult.fetchedAt, stale: fomcResult.stale } : null,
      blsReleases: blsResult ? { fetchedAt: blsResult.fetchedAt, stale: blsResult.stale } : null,
    },
  });
});
