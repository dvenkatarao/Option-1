/**
 * Seed universe of liquid US-listed ETFs. These are ONLY ticker symbols.
 * Names, categories, fees, holdings, prices and everything else are fetched live
 * from providers and cached; a ticker that fails to resolve is recorded with its
 * error and shown as unavailable instead of being guessed.
 *
 * At runtime this curated seed is unioned with the active U.S.-listed ETF listing
 * from Massive/Polygon (`market=stocks`, `locale=us`, `active=true`, `type=ETF`).
 * SEC ticker maps are useful for identity crosswalks but do not classify ETFs.
 */
export const UNIVERSE: string[] = [
  // Broad market
  "SPY", "VOO", "IVV", "VTI", "QQQ", "QQQM", "DIA", "IWM", "RSP", "SCHB", "ITOT", "IJH", "IJR", "MDY", "VB",
  // Style / factor
  "VUG", "VTV", "IWF", "IWD", "SCHG", "SCHV", "MGK", "SPYG", "SPYV", "MTUM", "QUAL", "USMV", "AVUV",
  // Dividend growth / high dividend
  "SCHD", "VYM", "VIG", "DGRO", "DVY", "HDV", "NOBL", "SDY", "SPYD", "SPHD", "SDIV",
  // Option income / high-yield strategies (relevant to NAV erosion analysis)
  "JEPI", "JEPQ", "QYLD", "XYLD", "RYLD", "DIVO", "QDTE", "YMAX", "TSLY", "NVDY", "CONY", "ULTY",
  // Sectors & industries
  "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE", "XLC",
  "VGT", "SMH", "SOXX", "IBB", "XBI", "KRE", "ITA", "XHB", "VNQ", "ARKK",
  // Bonds
  "AGG", "BND", "TLT", "IEF", "IEI", "SHY", "LQD", "HYG", "JNK", "TIP", "MUB", "BIL", "SGOV", "VCSH", "VCIT", "BNDX", "EMB", "SCHZ", "PFF",
  // International
  "VEA", "VWO", "IEFA", "IEMG", "EFA", "EEM", "VXUS", "VEU", "EWJ", "FXI", "INDA", "EWZ",
  // Commodities, crypto & alternatives
  "GLD", "IAU", "SLV", "USO", "DBC", "GDX", "IBIT", "BITO",
  // Leveraged / inverse (retained in the universe and explicitly flagged by the risk rules)
  "TQQQ", "SQQQ", "SPXL", "UPRO", "SOXL",
];

export const MARKET_INDEXES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^IXIC", label: "Nasdaq Comp." },
  { symbol: "^RUT", label: "Russell 2000" },
  { symbol: "^VIX", label: "VIX" },
];

export function isValidTicker(t: string) {
  return /^[A-Z0-9.\-]{1,10}$/.test(t);
}
