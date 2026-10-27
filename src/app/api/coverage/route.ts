import { handle } from "@/lib/api";
import { computeCoverage } from "@/lib/coverage";

export const dynamic = "force-dynamic";

/** Stored-field and feature-readiness coverage for the Research hub. */
export const GET = handle(async () => Response.json(await computeCoverage()));
