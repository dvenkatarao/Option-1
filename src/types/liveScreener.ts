import type { QualityGrade } from "../lib/grades";

/** JSON-safe screener row shared by the backend's score engine and API clients. */
export type ScreenRow = {
  ticker: string;
  name: string | null;
  category: string | null;
  family: string | null;
  leveraged: boolean;
  assetClass: string;
  rateTag: "defensive" | "neutral" | "sensitive";
  rateLabel: string;
  quality: QualityGrade | null;
  qualityScore: number | null;
  price: number | null;
  changePct: number | null;
  expense: number | null;
  yieldTtm: number | null;
  aum: number | null;
  ytd: number | null;
  r1y: number | null;
  r3y: number | null;
  r5y: number | null;
  vol3y: number | null;
  dd3y: number | null;
  sharpe: number | null;
  erosion: string;
  priceRet3y: number | null;
  capFunded: number | null;
  divCagr3y: number | null;
  /** Holdings-weighted analyst recommendation mean (Yahoo scale: 1=strong buy, 5=sell); optional on demand. */
  analystRec: number | null;
  /** Share of reported top-holdings weight with recommendation data, 0-1. */
  analystCoverage: number | null;
  freq: string;
};
