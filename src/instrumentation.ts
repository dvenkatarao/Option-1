/** Runs once when the Next.js server starts (not during `next build`). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startQuoteSnapshotter } = await import("./lib/snapshots");
  startQuoteSnapshotter();
  const { startWheelScanner } = await import("./lib/wheel-service");
  startWheelScanner();
}
