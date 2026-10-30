import React, { useState } from 'react';
import { ActiveWheelCampaign, WheelStock } from '../../types';
import { IllustrativeDataNotice } from '../common/IllustrativeDataNotice';
import {
  RotateCw,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';

interface WheelTrackerViewProps {
  campaigns: ActiveWheelCampaign[];
  stocks: WheelStock[];
  onAddCampaign: (campaign: ActiveWheelCampaign) => void;
  onNavigateToScanner: () => void;
}

export const WheelTrackerView: React.FC<WheelTrackerViewProps> = ({
  campaigns,
  stocks,
  onAddCampaign,
  onNavigateToScanner,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSymbol, setNewSymbol] = useState(stocks[0]?.symbol || 'MSFT');
  const [newType, setNewType] = useState<'PUT' | 'CALL'>('PUT');
  const [newStrike, setNewStrike] = useState(400);
  const [newPremium, setNewPremium] = useState(590);
  const [newDTE, setNewDTE] = useState(35);
  const [newContracts, setNewContracts] = useState(1);
  const [newNotes, setNewNotes] = useState('');

  // Total summary calculations
  const totalCollateral = campaigns.reduce((acc, c) => acc + c.collateralOrStockCost, 0);
  const totalPremiumsCollected = campaigns.reduce((acc, c) => acc + c.premiumCollectedTotal, 0);
  const totalUnrealizedPnL = campaigns.reduce((acc, c) => acc + c.unrealizedPnL, 0);
  const totalRealizedPnL = campaigns.reduce((acc, c) => acc + c.realizedPnL, 0);

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = stocks.find((s) => s.symbol === newSymbol) || stocks[0];
    const newCamp: ActiveWheelCampaign = {
      id: `camp-${Date.now()}`,
      symbol: stock.symbol,
      companyName: stock.name,
      currentStep: newType === 'PUT' ? 'SELLING_PUT' : 'SELLING_CALL',
      entryDate: new Date().toISOString().split('T')[0],
      initialStockPrice: stock.price,
      currentStockPrice: stock.price,
      targetStrike: newStrike,
      optionType: newType,
      expirationDate: new Date(Date.now() + newDTE * 86400000).toISOString().split('T')[0],
      dteRemaining: newDTE,
      contracts: newContracts,
      premiumCollectedTotal: newPremium,
      currentOptionValue: Math.round(newPremium * 0.5),
      collateralOrStockCost: newStrike * newContracts * 100,
      netCostBasisPerShare: Number((newStrike - newPremium / (newContracts * 100)).toFixed(2)),
      unrealizedPnL: Math.round(newPremium * 0.5),
      realizedPnL: 0,
      currentCycleROC: Number(((newPremium / (newStrike * newContracts * 100)) * 100).toFixed(2)),
      annualizedROC: Number(
        (((newPremium / (newStrike * newContracts * 100)) * 100 * 365) / newDTE).toFixed(2)
      ),
      status: 'In Profit',
      notes: newNotes || `Sold ${newContracts}x ${newStrike} ${newType}. Targeting 50% profit.`,
    };

    onAddCampaign(newCamp);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RotateCw className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-white">Active Positions &amp; Roll Journal</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Review seeded examples and session-only entries; calculations are not a live broker journal or AI trade instruction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Log Demo Campaign</span>
          </button>
        </div>
      </div>

      <IllustrativeDataNotice detail="Seeded positions and new entries are kept only in this browser session, use sample quote inputs, and are not connected to a broker. Use Persistent Accounts & Ledger for saved manual records." />

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Example Wheel Collateral</span>
          <span className="text-xl font-bold text-white mt-1 block">
            ${totalCollateral.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500">{campaigns.length} Session Entries</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Example Premiums</span>
          <span className="text-xl font-bold text-emerald-400 mt-1 block">
            +${totalPremiumsCollected.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500">Sample value</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Illustrative P&L</span>
          <span className="text-xl font-bold text-cyan-300 mt-1 block">
            +${totalUnrealizedPnL.toLocaleString()}
          </span>
          <span className="text-[10px] text-emerald-400 font-semibold">Example decay assumption</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">Model Profit</span>
          <span className="text-xl font-bold text-emerald-400 mt-1 block">
            +${totalRealizedPnL.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500">Sample value</span>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Session Example Breakdown</h2>
          <span className="text-xs text-slate-400 font-mono">
            Example 50% profit-target rule
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg hover:border-slate-700 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 font-mono font-bold text-emerald-400 flex items-center justify-center text-sm">
                    {camp.symbol}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-base text-white">{camp.symbol}</span>
                      <span className="text-xs text-slate-400">({camp.companyName})</span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {camp.currentStep.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      Entry Date: {camp.entryDate} • Stock: ${camp.currentStockPrice.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block text-[10px]">Current Gain</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      +${camp.unrealizedPnL + camp.realizedPnL}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      camp.status === 'In Profit'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                    }`}
                  >
                    {camp.status}
                  </span>
                </div>
              </div>

              {/* Data Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Position</span>
                  <span className="font-bold text-white">
                    {camp.contracts}x ${camp.targetStrike} {camp.optionType}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Total Premium</span>
                  <span className="font-bold text-emerald-400">+${camp.premiumCollectedTotal}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Net Cost Basis</span>
                  <span className="font-bold text-cyan-300">${camp.netCostBasisPerShare}/sh</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Expiration</span>
                  <span className="font-bold text-slate-200">
                    {camp.dteRemaining > 0 ? `${camp.dteRemaining} DTE` : 'Assigned / Expired'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Annualized ROC</span>
                  <span className="font-extrabold text-emerald-400">{camp.annualizedROC}%</span>
                </div>
              </div>

              {/* Actionable Roll Advice Banner */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-slate-300">{camp.notes}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {camp.currentStep === 'ASSIGNED_STOCK' ? (
                    <button
                      onClick={onNavigateToScanner}
                      className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition"
                    >
                      Sell Covered Call
                    </button>
                  ) : (
                    <button
                      onClick={() => alert(`Demo preview: ${camp.symbol} ${camp.targetStrike} Put reached its sample 50% profit target. No broker position or ledger entry was changed.`)}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition"
                    >
                      Example close at 50% (+$310)
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Log Campaign Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RotateCw className="w-5 h-5 text-emerald-400" />
                Log Active Wheel Position
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 mt-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Underlying Blue-Chip</label>
                  <select
                    value={newSymbol}
                    onChange={(e) => {
                      setNewSymbol(e.target.value);
                      const st = stocks.find((s) => s.symbol === e.target.value);
                      if (st) {
                        setNewStrike(st.recommendedStrike);
                        setNewPremium(Math.round(st.recommendedStrike * 1.5));
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold"
                  >
                    {stocks.map((s) => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.symbol} ({s.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Position Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold"
                  >
                    <option value="PUT">Cash-Secured Put (Phase 1)</option>
                    <option value="CALL">Covered Call (Phase 3)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Contracts</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newContracts}
                    onChange={(e) => setNewContracts(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold text-center"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Strike ($)</label>
                  <input
                    type="number"
                    value={newStrike}
                    onChange={(e) => setNewStrike(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-bold text-center"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Total Prem ($)</label>
                  <input
                    type="number"
                    value={newPremium}
                    onChange={(e) => setNewPremium(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-emerald-400 font-bold text-center"
                    required
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">DTE</label>
                  <input
                    type="number"
                    value={newDTE}
                    onChange={(e) => setNewDTE(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-cyan-300 font-bold text-center"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Strategy Notes / Profit Target</label>
                <input
                  type="text"
                  placeholder="e.g. Sold 0.20 delta put. Plan to close at 50% max profit ($295)."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 font-sans">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold"
                >
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
