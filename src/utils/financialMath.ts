import { ETFData, WheelStock } from '../types';

/**
 * Calculates Annualized Return on Capital (ROC)
 * Formula: (Premium / Collateral) * (365 / DTE) * 100
 */
export function calculateAnnualizedROC(premium: number, collateral: number, dte: number): number {
  if (collateral <= 0 || dte <= 0) return 0;
  const rawROC = (premium / collateral) * 100;
  return Number(((rawROC * 365) / dte).toFixed(2));
}

/**
 * Calculates Downside Buffer percentage from current price to breakeven
 */
export function calculateDownsideBuffer(currentPrice: number, strike: number, premiumPerShare: number): number {
  const breakeven = strike - premiumPerShare;
  if (currentPrice <= 0) return 0;
  return Number((((currentPrice - breakeven) / currentPrice) * 100).toFixed(2));
}

/**
 * Calculates ETF overlap between two ETFs based on top holdings
 */
export function calculateETFOverlap(etfA: ETFData, etfB: ETFData): {
  overlapPercent: number;
  sharedHoldings: { symbol: string; name: string; weightA: number; weightB: number; minWeight: number }[];
  distinctCountA: number;
  distinctCountB: number;
} {
  const holdingsA = etfA.topHoldings || [];
  const holdingsB = etfB.topHoldings || [];

  const mapB = new Map(holdingsB.map((h) => [h.symbol, h]));
  const shared: { symbol: string; name: string; weightA: number; weightB: number; minWeight: number }[] = [];

  let overlapSum = 0;

  for (const hA of holdingsA) {
    const hB = mapB.get(hA.symbol);
    if (hB) {
      const minW = Math.min(hA.weight, hB.weight);
      overlapSum += minW;
      shared.push({
        symbol: hA.symbol,
        name: hA.name,
        weightA: hA.weight,
        weightB: hB.weight,
        minWeight: minW,
      });
    }
  }

  // Multiply overlap by 2 for realistic multi-asset fund approximation
  const estimatedOverlap = Math.min(100, Math.round(overlapSum * 1.8));

  return {
    overlapPercent: estimatedOverlap,
    sharedHoldings: shared.sort((a, b) => b.minWeight - a.minWeight),
    distinctCountA: holdingsA.length - shared.length,
    distinctCountB: holdingsB.length - shared.length,
  };
}

/**
 * Simulates portfolio compounding over 5 to 20 years
 */
export function simulatePortfolioGrowth(
  initialCapital: number,
  monthlyContribution: number,
  etfAnnualReturn: number, // e.g. 10%
  wheelAnnualROC: number, // e.g. 20%
  etfAllocationRatio: number, // 0.0 - 1.0 (e.g. 0.5)
  years: number = 10
): {
  year: number;
  dualEngineValue: number;
  buyAndHoldBenchmarkValue: number;
  cumulativeCashFlow: number;
  monthlyCashFlowAtYear: number;
}[] {
  const results = [];
  const blendedReturn = etfAnnualReturn * etfAllocationRatio + wheelAnnualROC * (1 - etfAllocationRatio);
  const benchmarkReturn = etfAnnualReturn; // standard S&P 500 Buy & Hold

  let dualCapital = initialCapital;
  let benchmarkCapital = initialCapital;
  let cumulativeCashFlow = 0;

  for (let y = 1; y <= years; y++) {
    // 12 months in a year
    for (let m = 1; m <= 12; m++) {
      dualCapital = dualCapital * (1 + blendedReturn / 100 / 12) + monthlyContribution;
      benchmarkCapital = benchmarkCapital * (1 + benchmarkReturn / 100 / 12) + monthlyContribution;

      // Estimated cash flow from wheel and dividends
      const monthlyGeneratedIncome = dualCapital * (blendedReturn / 100 / 12);
      cumulativeCashFlow += monthlyGeneratedIncome;
    }

    const currentMonthlyYield = Math.round((dualCapital * (blendedReturn / 100)) / 12);

    results.push({
      year: y,
      dualEngineValue: Math.round(dualCapital),
      buyAndHoldBenchmarkValue: Math.round(benchmarkCapital),
      cumulativeCashFlow: Math.round(cumulativeCashFlow),
      monthlyCashFlowAtYear: currentMonthlyYield,
    });
  }

  return results;
}

/**
 * Calculates Wheel Lifecycle simulation steps
 */
export interface WheelSimulationState {
  stock: WheelStock;
  putStrike: number;
  putPremium: number;
  dte: number;
  callStrike: number;
  callPremium: number;
  dividendPerShare: number;
  contracts: number;
}

export function computeWheelCycleMetrics(state: WheelSimulationState) {
  const shares = state.contracts * 100;
  const putCollateral = state.putStrike * shares;
  const putIncome = state.putPremium * shares;
  const putROC = (putIncome / putCollateral) * 100;
  const putAnnualROC = (putROC * 365) / state.dte;

  const costBasisIfAssigned = state.putStrike - state.putPremium;
  const totalCostBasisDollars = costBasisIfAssigned * shares;

  const callIncome = state.callPremium * shares;
  const divIncome = state.dividendPerShare * shares;

  const capitalGainIfCalled = (state.callStrike - state.putStrike) * shares;
  const totalCycleProfit = putIncome + callIncome + divIncome + capitalGainIfCalled;
  const totalCycleROI = (totalCycleProfit / putCollateral) * 100;

  const daysTotal = state.dte * 2; // approx 2 option cycles
  const totalAnnualizedROI = (totalCycleROI * 365) / daysTotal;

  return {
    shares,
    putCollateral,
    putIncome,
    putROC: Number(putROC.toFixed(2)),
    putAnnualROC: Number(putAnnualROC.toFixed(2)),
    costBasisIfAssigned: Number(costBasisIfAssigned.toFixed(2)),
    costBasisReductionPercent: Number(((state.putPremium / state.putStrike) * 100).toFixed(2)),
    totalCostBasisDollars: Math.round(totalCostBasisDollars),
    callIncome,
    divIncome,
    capitalGainIfCalled,
    totalCycleProfit: Math.round(totalCycleProfit),
    totalCycleROI: Number(totalCycleROI.toFixed(2)),
    totalAnnualizedROI: Number(totalAnnualizedROI.toFixed(2)),
    breakEvenWithCall: Number((costBasisIfAssigned - state.callPremium).toFixed(2)),
  };
}

/**
 * Generates options payoff points for chart
 */
export function generatePayoffCurve(
  strategy: 'CSP' | 'COVERED_CALL' | 'FULL_CYCLE',
  strike: number,
  premium: number,
  callStrike?: number,
  callPremium?: number
) {
  const points = [];
  const minPrice = Math.floor(strike * 0.75);
  const maxPrice = Math.ceil(strike * 1.25);
  const step = Math.max(1, (maxPrice - minPrice) / 30);

  for (let p = minPrice; p <= maxPrice; p += step) {
    let pnl = 0;
    const priceAtExp = Number(p.toFixed(2));

    if (strategy === 'CSP') {
      // Selling Cash Secured Put: Max profit is premium. Loss if price < strike - premium
      if (priceAtExp >= strike) {
        pnl = premium * 100;
      } else {
        pnl = (premium - (strike - priceAtExp)) * 100;
      }
    } else if (strategy === 'COVERED_CALL') {
      const cStrike = callStrike || strike * 1.05;
      const cPrem = callPremium || premium;
      // Covered Call (Stock bought at Strike, Call sold at cStrike)
      const stockGain = (priceAtExp - strike) * 100;
      let shortCallGain = cPrem * 100;
      if (priceAtExp > cStrike) {
        shortCallGain -= (priceAtExp - cStrike) * 100;
      }
      pnl = stockGain + shortCallGain;
    } else {
      // Full Wheel Cycle
      const cStrike = callStrike || strike * 1.05;
      const totalPrem = (premium + (callPremium || 0)) * 100;
      if (priceAtExp >= cStrike) {
        pnl = (cStrike - strike) * 100 + totalPrem;
      } else if (priceAtExp >= strike) {
        pnl = (priceAtExp - strike) * 100 + totalPrem;
      } else {
        pnl = (priceAtExp - strike) * 100 + totalPrem;
      }
    }

    points.push({
      price: priceAtExp,
      pnl: Math.round(pnl),
      zeroLine: 0,
    });
  }

  return points;
}
