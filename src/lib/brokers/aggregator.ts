import { encryptCredential, generateId } from "@/lib/security";
import { BrokerType, SUPPORTED_BROKERS, ParsedPositionImport } from "./types";

/**
 * Broker connection service.
 *
 * HONEST STATUS: live SnapTrade / Plaid connections are NOT implemented. Calling them returns an
 * explicit error instead of pretending to connect. The two working paths are:
 *   - "sandbox": clearly-labelled DEMO positions (portfolio.isDemo = true) for trying the UI
 *   - CSV import: real positions from a broker statement export (see /api/portfolios/[id]/import)
 */

export interface BrokerConnectionConfig {
  brokerType: BrokerType;
  portfolioName: string;
  accountNumberMasked?: string;
  connectionMethod: "sandbox";
  // For direct OAuth or API token inputs
  apiCredentials?: Record<string, string>;
}

export interface BrokerSyncResponse {
  success: boolean;
  portfolioId?: string;
  positions: ParsedPositionImport[];
  syncMessage: string;
  encryptedTokenPayload?: string;
  error?: string;
}

// DEMO-ONLY template positions (not real accounts). Shown in the UI with a DEMO badge.
const SANDBOX_PORTFOLIOS: Record<BrokerType, ParsedPositionImport[]> = {
  schwab: [
    { ticker: "SCHD", quantity: 150, averageCostBasis: 78.4, purchaseDate: "2023-08-14" },
    { ticker: "VOO", quantity: 40, averageCostBasis: 485.2, purchaseDate: "2023-10-10" },
    { ticker: "QQQM", quantity: 75, averageCostBasis: 195.5, purchaseDate: "2024-01-15" },
    { ticker: "JEPI", quantity: 110, averageCostBasis: 55.6, purchaseDate: "2023-11-20" },
    { ticker: "JEPQ", quantity: 90, averageCostBasis: 51.2, purchaseDate: "2024-02-05" },
  ],
  fidelity: [
    { ticker: "VTI", quantity: 120, averageCostBasis: 260.5, purchaseDate: "2023-05-12" },
    { ticker: "VUG", quantity: 50, averageCostBasis: 345.8, purchaseDate: "2023-09-18" },
    { ticker: "BND", quantity: 160, averageCostBasis: 72.1, purchaseDate: "2023-12-01" },
    { ticker: "AVUV", quantity: 85, averageCostBasis: 88.4, purchaseDate: "2024-03-22" },
    { ticker: "VXUS", quantity: 140, averageCostBasis: 58.2, purchaseDate: "2023-07-15" },
  ],
  vanguard: [
    { ticker: "VOO", quantity: 80, averageCostBasis: 475.6, purchaseDate: "2022-11-10" },
    { ticker: "VIG", quantity: 65, averageCostBasis: 178.9, purchaseDate: "2023-04-14" },
    { ticker: "VXUS", quantity: 200, averageCostBasis: 59.4, purchaseDate: "2023-01-20" },
    { ticker: "BND", quantity: 130, averageCostBasis: 73.5, purchaseDate: "2023-06-15" },
  ],
  ninjatrader: [
    { ticker: "TQQQ", quantity: 220, averageCostBasis: 72.5, purchaseDate: "2024-02-10", assetType: "FUTURES" },
    { ticker: "SOXL", quantity: 150, averageCostBasis: 42.1, purchaseDate: "2024-04-05", assetType: "FUTURES" },
    { ticker: "SPY", quantity: 35, averageCostBasis: 520.4, purchaseDate: "2024-01-08", assetType: "ETF" },
    { ticker: "TLT", quantity: 80, averageCostBasis: 93.8, purchaseDate: "2024-03-12", assetType: "ETF" },
  ],
  moomoo: [
    { ticker: "QQQ", quantity: 55, averageCostBasis: 450.2, purchaseDate: "2023-12-14" },
    { ticker: "SMH", quantity: 45, averageCostBasis: 225.6, purchaseDate: "2024-02-18" },
    { ticker: "IBIT", quantity: 180, averageCostBasis: 36.5, purchaseDate: "2024-03-01" },
    { ticker: "XLK", quantity: 65, averageCostBasis: 210.4, purchaseDate: "2023-10-25" },
  ],
  manual: [
    { ticker: "SPY", quantity: 50, averageCostBasis: 510.0, purchaseDate: "2023-09-01" },
    { ticker: "QQQ", quantity: 35, averageCostBasis: 440.0, purchaseDate: "2023-11-15" },
    { ticker: "SCHD", quantity: 100, averageCostBasis: 77.5, purchaseDate: "2023-08-20" },
  ],
};

/** Creates a DEMO connection with template positions. Live aggregators are not implemented. */
export async function connectBrokerAccount(config: BrokerConnectionConfig): Promise<BrokerSyncResponse> {
  const brokerMeta = SUPPORTED_BROKERS[config.brokerType];
  const template = SANDBOX_PORTFOLIOS[config.brokerType] ?? SANDBOX_PORTFOLIOS.manual;
  return {
    success: true,
    positions: template,
    syncMessage: `Created DEMO ${brokerMeta.name} account with ${template.length} sample positions (not your real holdings)`,
    encryptedTokenPayload: encryptCredential({
      provider: "sandbox",
      broker: config.brokerType,
      simulatedAccountId: generateId("acc"),
      connectedAt: new Date().toISOString(),
    }),
  };
}

export const LIVE_AGGREGATORS_MESSAGE =
  "Live broker connections (SnapTrade / Plaid) are not available in this build. Use CSV import to load your real positions.";
