import { handle } from "@/lib/api";
import { getLatest8Ks, getMacroNews, getRecentEarningsReleases, getUpcomingEarnings } from "@/lib/news";

export const dynamic = "force-dynamic";

/** Regulatory, macro and company events. News content is linked to the originating publisher. */
export const GET = handle(async (req: Request) => {
  const limit = Math.min(80, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 40) || 40));
  const [macro, filings, announcements, upcomingEarnings] = await Promise.all([
    getMacroNews(limit),
    getRecentEarningsReleases(14),
    getLatest8Ks(Math.min(limit, 40)),
    getUpcomingEarnings(),
  ]);

  return Response.json({
    items: macro.items,
    feeds: macro.status,
    earningsReleases: filings?.data ?? [],
    earningsFetchedAt: filings?.fetchedAt ?? null,
    earningsStale: filings?.stale ?? false,
    announcements: announcements?.data ?? [],
    announcementsFetchedAt: announcements?.fetchedAt ?? null,
    announcementsStale: announcements?.stale ?? false,
    upcomingEarnings,
  });
});
