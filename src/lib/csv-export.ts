/**
 * Sprint D — CSV export helpers (pure, no DOM required for generation).
 * Client triggers download via blob URL.
 */

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Quote if contains comma, quote, newline
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Helpers for screener / recommend shapes — columns match the UX copy
export function screenerCsvRows(rows: { ticker: string; name: string | null; category: string | null; expense: number | null; yieldTtm: number | null; aum: number | null; ytd: number | null; r1y: number | null; r3y: number | null; vol3y: number | null; dd3y: number | null; sharpe: number | null; erosion: string; quality: string | null; rateTag: string }[]) {
  const headers = ["Ticker", "Name", "Category", "Quality", "Expense %", "Yield TTM %", "AUM", "YTD %", "1Y %", "3Y ann %", "Vol 3Y %", "Max DD 3Y %", "Sharpe 3Y", "NAV erosion", "Rate fit"];
  const data = rows.map((r) => [
    r.ticker,
    r.name ?? "",
    r.category ?? "",
    r.quality ?? "",
    r.expense != null ? (r.expense * 100).toFixed(2) : "",
    r.yieldTtm != null ? (r.yieldTtm * 100).toFixed(2) : "",
    r.aum ?? "",
    r.ytd != null ? (r.ytd * 100).toFixed(2) : "",
    r.r1y != null ? (r.r1y * 100).toFixed(2) : "",
    r.r3y != null ? (r.r3y * 100).toFixed(2) : "",
    r.vol3y != null ? (r.vol3y * 100).toFixed(2) : "",
    r.dd3y != null ? (r.dd3y * 100).toFixed(2) : "",
    r.sharpe ?? "",
    r.erosion,
    r.rateTag,
  ]);
  return rowsToCsv(headers, data);
}

export function recommendCsvRows(scored: { row: { ticker: string; name: string | null; category: string | null; quality: string | null; expense: number | null; yieldTtm: number | null; r3y: number | null; vol3y: number | null; erosion: string }; score: number; coverage: number }[]) {
  const headers = ["Rank", "Ticker", "Name", "Category", "Quality", "Score", "Coverage %", "Expense %", "Yield %", "3Y ann %", "Vol 3Y %", "Erosion"];
  const data = scored.map((s, i) => [
    String(i + 1),
    s.row.ticker,
    s.row.name ?? "",
    s.row.category ?? "",
    s.row.quality ?? "",
    s.score.toFixed(0),
    Math.round(s.coverage * 100).toString(),
    s.row.expense != null ? (s.row.expense * 100).toFixed(2) : "",
    s.row.yieldTtm != null ? (s.row.yieldTtm * 100).toFixed(2) : "",
    s.row.r3y != null ? (s.row.r3y * 100).toFixed(2) : "",
    s.row.vol3y != null ? (s.row.vol3y * 100).toFixed(2) : "",
    s.row.erosion,
  ]);
  return rowsToCsv(headers, data);
}
