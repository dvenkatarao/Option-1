import { BrokerType, CsvParseResult, ParsedPositionImport } from "./types";
import { isValidTicker } from "@/lib/universe";

/**
 * Parses CSV/TSV contents with smart dialect detection and support for
 * Charles Schwab, Fidelity, Vanguard, NinjaTrader, MooMoo, and generic formats.
 */

const MAX_CSV_CHARS = 1_000_000;
const MAX_ROWS = 5000;

function cleanNumber(val: string | undefined | null): number | null {
  if (!val) return null;
  let str = val.trim();
  // Handle parentheses for negative numbers e.g. ($1,234.56) -> -1234.56
  const isNegative = str.startsWith("(") && str.endsWith(")");
  str = str.replace(/[$,%()"]/g, "").trim();
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return isNegative ? -Math.abs(num) : num;
}

function parseCsvRows(content: string): string[][] {
  const lines = content.split(/\r?\n/);
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // RFC 4180 quote-aware split
    const row: string[] = [];
    let inQuotes = false;
    let currentCell = "";

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === "," || char === "\t") && !inQuotes) {
        row.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

export function parseBrokerPositionsCsv(
  csvContent: string,
  preferredBroker?: BrokerType,
): CsvParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let costFromPriceCount = 0;
  const positions: ParsedPositionImport[] = [];
  let ignoredRowsCount = 0;

  if (csvContent.length > MAX_CSV_CHARS) {
    return { success: false, brokerDetected: preferredBroker || "manual", positions: [], ignoredRowsCount: 0, warnings: [], errors: ["CSV file is too large (max 1 MB)"] };
  }
  if (!csvContent || !csvContent.trim()) {
    return {
      success: false,
      brokerDetected: preferredBroker || "manual",
      positions: [],
      ignoredRowsCount: 0,
      warnings: [],
      errors: ["CSV file is empty"],
    };
  }

  const rawRows = parseCsvRows(csvContent);
  if (rawRows.length < 2) {
    return {
      success: false,
      brokerDetected: preferredBroker || "manual",
      positions: [],
      ignoredRowsCount: 0,
      warnings: [],
      errors: ["CSV must contain at least a header row and one data row"],
    };
  }

  // Find header row: look for row containing common column names like symbol, ticker, instrument, shares, quantity
  let headerIndex = -1;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const rowLower = rawRows[i].map((c) => c.toLowerCase());
    const hasSymbol = rowLower.some(
      (c) =>
        c === "symbol" ||
        c === "ticker" ||
        c === "instrument" ||
        c.includes("symbol") ||
        c.includes("ticker"),
    );
    const hasQuantity = rowLower.some(
      (c) =>
        c === "quantity" ||
        c === "shares" ||
        c === "qty" ||
        c === "position" ||
        c.includes("shares"),
    );

    if (hasSymbol && hasQuantity) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    // If not found, default to first non-empty row
    headerIndex = 0;
  }

  const headerRow = rawRows[headerIndex].map((c) => c.toLowerCase().trim());

  // Determine broker if not explicitly selected
  let broker: BrokerType = preferredBroker || "manual";
  if (!preferredBroker || preferredBroker === "manual") {
    const headerStr = headerRow.join(" ");
    if (headerStr.includes("investment name") && headerStr.includes("share price")) {
      broker = "vanguard";
    } else if (headerStr.includes("account number") && headerStr.includes("last price")) {
      broker = "fidelity";
    } else if (headerStr.includes("security type") || (headerStr.includes("cost basis") && headerStr.includes("price"))) {
      broker = "schwab";
    } else if (headerStr.includes("instrument") && headerStr.includes("avg price")) {
      broker = "ninjatrader";
    } else if (headerStr.includes("cost price") && headerStr.includes("qty")) {
      broker = "moomoo";
    }
  }

  // Map column indexes
  const colIndex = {
    ticker: -1,
    quantity: -1,
    costBasis: -1,
    avgPrice: -1,
    currentPrice: -1,
    totalValue: -1,
    purchaseDate: -1,
    assetType: -1,
  };

  headerRow.forEach((name, idx) => {
    if (name === "symbol" || name === "ticker" || name === "instrument") {
      colIndex.ticker = idx;
    } else if (colIndex.ticker === -1 && (name.includes("symbol") || name.includes("ticker"))) {
      colIndex.ticker = idx;
    }

    if (name === "quantity" || name === "shares" || name === "qty" || name === "position") {
      colIndex.quantity = idx;
    } else if (colIndex.quantity === -1 && (name.includes("quantity") || name.includes("shares"))) {
      colIndex.quantity = idx;
    }

    if (
      name === "cost basis" ||
      name === "total cost" ||
      name === "cost basis (total)"
    ) {
      colIndex.costBasis = idx;
    }

    if (
      name === "average cost basis" ||
      name === "average cost" ||
      name === "avg cost" ||
      name === "avg price" ||
      name === "cost price" ||
      name === "unit cost"
    ) {
      colIndex.avgPrice = idx;
    }

    if (
      name === "price" ||
      name === "last price" ||
      name === "share price" ||
      name === "current price"
    ) {
      colIndex.currentPrice = idx;
    }

    if (name === "total value" || name === "market value" || name === "current value") {
      colIndex.totalValue = idx;
    }

    if (name.includes("date") || name.includes("acquired")) {
      colIndex.purchaseDate = idx;
    }

    if (name.includes("type") || name.includes("security type") || name.includes("asset class")) {
      colIndex.assetType = idx;
    }
  });

  if (colIndex.ticker === -1 || colIndex.quantity === -1) {
    return {
      success: false,
      brokerDetected: broker,
      positions: [],
      ignoredRowsCount: 0,
      warnings: [],
      errors: [
        `Could not detect required columns (Symbol and Quantity) in header row: [${headerRow.join(
          ", ",
        )}]`,
      ],
    };
  }

  // Parse data rows
  const dataRows = rawRows.slice(headerIndex + 1, headerIndex + 1 + MAX_ROWS);
  if (rawRows.length - headerIndex - 1 > MAX_ROWS) warnings.push(`Only the first ${MAX_ROWS} rows were read`);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawTicker = (row[colIndex.ticker] || "").trim().toUpperCase();

    // Skip summary, cash, total or blank rows
    if (
      !rawTicker ||
      rawTicker === "TOTAL" ||
      rawTicker === "CASH" ||
      rawTicker === "ACCOUNT TOTAL" ||
      rawTicker.startsWith("TOTAL ") ||
      rawTicker.includes("MONEY MARKET")
    ) {
      ignoredRowsCount++;
      continue;
    }

    // Clean ticker: remove exchange prefixes/suffixes like NYSE: or .US
    const cleanedTicker = rawTicker
      .replace(/^(NASDAQ|NYSE|BATS|ARCA):/, "")
      .replace(/\.(US|O|Q)$/, "")
      .trim();

    if (!isValidTicker(cleanedTicker)) {
      ignoredRowsCount++;
      errors.push(`Row ${headerIndex + i + 2}: "${rawTicker.slice(0, 20)}" is not a valid ticker symbol`);
      continue;
    }

    const qty = cleanNumber(row[colIndex.quantity]);
    if (qty === null || qty <= 0) {
      ignoredRowsCount++;
      continue;
    }

    // Determine cost basis
    let avgCostBasis: number | null = null;

    if (colIndex.avgPrice !== -1) {
      avgCostBasis = cleanNumber(row[colIndex.avgPrice]);
    }

    if ((avgCostBasis === null || avgCostBasis <= 0) && colIndex.costBasis !== -1) {
      const totalCost = cleanNumber(row[colIndex.costBasis]);
      if (totalCost !== null && totalCost > 0 && qty > 0) {
        avgCostBasis = totalCost / qty;
      }
    }

    if ((avgCostBasis === null || avgCostBasis <= 0) && colIndex.currentPrice !== -1) {
      // File has no cost basis: use the statement's price so the row is usable, but say so.
      avgCostBasis = cleanNumber(row[colIndex.currentPrice]);
      if (avgCostBasis !== null && avgCostBasis > 0) costFromPriceCount++;
    }

    if (avgCostBasis === null || avgCostBasis <= 0) {
      // Never invent a cost basis: skip the row and tell the user.
      ignoredRowsCount++;
      errors.push(`Row ${headerIndex + i + 2} (${cleanedTicker}): no cost basis or price found, row skipped`);
      continue;
    }

    const currentPrice = colIndex.currentPrice !== -1 ? cleanNumber(row[colIndex.currentPrice]) : null;
    const purchaseDate =
      colIndex.purchaseDate !== -1 && row[colIndex.purchaseDate]
        ? row[colIndex.purchaseDate].trim()
        : undefined;

    // Determine asset class type
    let assetType: "ETF" | "EQUITY" | "BOND" | "CASH" | "FUTURES" = "ETF";
    const typeText = colIndex.assetType !== -1 ? (row[colIndex.assetType] || "").toLowerCase() : "";
    if (typeText.includes("future")) assetType = "FUTURES";
    else if (typeText.includes("bond") || typeText.includes("fixed")) assetType = "BOND";
    else if (typeText.includes("equity") || typeText.includes("stock")) assetType = "EQUITY";

    positions.push({
      ticker: cleanedTicker,
      quantity: Math.round(qty * 10000) / 10000,
      averageCostBasis: Math.round(avgCostBasis * 100) / 100,
      currentPrice: currentPrice ? Math.round(currentPrice * 100) / 100 : undefined,
      purchaseDate,
      assetType,
    });
  }

  if (costFromPriceCount > 0) {
    warnings.push(
      `${costFromPriceCount} row(s) had no cost basis; the statement price was used instead, so their gain/loss is not meaningful.`,
    );
  }

  return {
    success: positions.length > 0,
    brokerDetected: broker,
    positions,
    ignoredRowsCount,
    errors,
    warnings,
  };
}
