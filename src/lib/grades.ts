/** Client-safe grade vocabulary shared by the quality scorer, tables and badges. */
export type QualityGrade = "A" | "B" | "C" | "D" | "F";

export const GRADE_ORDER: QualityGrade[] = ["A", "B", "C", "D", "F"];
export const gradeRank = (g: QualityGrade) => GRADE_ORDER.indexOf(g);
/** The worse (lower) of two grades. */
export const worseGrade = (a: QualityGrade, b: QualityGrade): QualityGrade => (gradeRank(a) >= gradeRank(b) ? a : b);
export const isLowGrade = (g: QualityGrade | null | undefined) => g === "D" || g === "F";

export const GRADE_WORD: Record<QualityGrade, string> = { A: "Excellent", B: "Good", C: "Fair", D: "Weak", F: "Poor" };

export const gradeStyle: Record<QualityGrade | "none", string> = {
  A: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  B: "bg-lime-50 text-lime-700 ring-lime-200",
  C: "bg-amber-50 text-amber-800 ring-amber-200",
  D: "bg-orange-50 text-orange-700 ring-orange-200",
  F: "bg-rose-50 text-rose-700 ring-rose-200",
  none: "bg-slate-100 text-slate-500 ring-slate-200",
};

/** A >= 85, B 70-84, C 55-69, D 40-54, F < 40. */
export function gradeFor(score: number): QualityGrade {
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
}
