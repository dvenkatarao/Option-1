export type StarterHolding = { ticker: string; weight: number; label: string };
export type StarterPortfolio = {
  id: string;
  name: string;
  badge: string;
  goal: "income" | "growth" | "balanced" | "defensive" | "lowcost";
  horizon: "1-3" | "3-7" | "7+";
  risk: "preserve" | "modest" | "grow";
  holdings: StarterHolding[];
  why: string;
  watch: string;
  color: string;
};

/**
 * Three canonical starter plans — one-click into Portfolio tracker.
 * Weights sum to 1. Tickers are all in UNIVERSE so quotes/history exist.
 * No advice: just diversified starting points the user can tweak.
 */
export const STARTER_PORTFOLIOS: StarterPortfolio[] = [
  {
    id: "conservative",
    name: "Conservative Income",
    badge: "1–3 yr · preserve",
    goal: "income",
    horizon: "1-3",
    risk: "preserve",
    holdings: [
      { ticker: "BND", weight: 0.4, label: "US total bonds" },
      { ticker: "SCHD", weight: 0.3, label: "Dividend growth" },
      { ticker: "VTI", weight: 0.3, label: "Total US market" },
    ],
    why: "40% bonds dampens drawdowns; SCHD adds quality dividend income; VTI keeps broad equity growth without concentration.",
    watch: "Rises in long yields hurt BND; SCHD is sector-tilted to industrials/financials.",
    color: "emerald",
  },
  {
    id: "balanced",
    name: "Balanced 60/40 Core",
    badge: "3–7 yr · modest",
    goal: "balanced",
    horizon: "3-7",
    risk: "modest",
    holdings: [
      { ticker: "VOO", weight: 0.4, label: "S&P 500" },
      { ticker: "VXUS", weight: 0.2, label: "Total international" },
      { ticker: "VTI", weight: 0.2, label: "Total US" },
      { ticker: "BND", weight: 0.2, label: "US bonds" },
    ],
    why: "80/20 equity/bond classic: US + international diversification; cheap, large, high-quality funds.",
    watch: "VOO+VTI overlap ~85% — intentionally redundant for size; trim one if you want purity.",
    color: "indigo",
  },
  {
    id: "growth",
    name: "Growth Tilt",
    badge: "7+ yr · grow",
    goal: "growth",
    horizon: "7+",
    risk: "grow",
    holdings: [
      { ticker: "QQQ", weight: 0.4, label: "Nasdaq-100" },
      { ticker: "VUG", weight: 0.3, label: "Large-cap growth" },
      { ticker: "SMH", weight: 0.3, label: "Semiconductors" },
    ],
    why: "Long horizon can ride tech cycles; QQQ/VUG broad growth + SMH concentrated semis for upside.",
    watch: "High beta & rate-sensitive — falls hard when real yields spike; only for money you won't touch for years.",
    color: "violet",
  },
];

export function starterForAnswers(goal: string, horizon: string, risk: string): StarterPortfolio {
  // Heuristic mapping: risk is strongest signal, then horizon, then goal
  if (risk === "preserve" || horizon === "1-3") return STARTER_PORTFOLIOS[0];
  if (risk === "grow" || horizon === "7+" || goal === "growth") return STARTER_PORTFOLIOS[2];
  return STARTER_PORTFOLIOS[1];
}

export function recommendQueryForStarter(s: StarterPortfolio): string {
  // Pre-fill Recommend page so user sees why these score well for the linked goal
  const p = new URLSearchParams({ goal: s.goal, aum: "1000000000", rank: "class" });
  return p.toString();
}
