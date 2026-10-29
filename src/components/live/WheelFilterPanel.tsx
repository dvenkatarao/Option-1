import { ChevronDown } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { WheelFilterState } from "./wheel-filter-state";

const inputClass = "w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60";
const rangeClass = "mt-1.5 w-full cursor-pointer accent-cyan-400";

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass + " mt-1"}
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
  minLabel,
  maxLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: string) => void;
  minLabel: string;
  maxLabel: string;
}) {
  return (
    <label className="block rounded-lg border border-slate-800 bg-slate-950/70 p-2">
      <span className="flex items-center justify-between gap-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <output className="font-mono text-[10px] font-bold normal-case tracking-normal text-cyan-200">{valueLabel}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={rangeClass}
      />
      <span className="mt-0.5 flex justify-between text-[8px] text-slate-600"><span>{minLabel}</span><span>{maxLabel}</span></span>
    </label>
  );
}

function RangeSliderField({
  label,
  minValue,
  maxValue,
  min,
  max,
  step,
  onChange,
  formatValue,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (minValue: string, maxValue: string) => void;
  formatValue: (value: number) => string;
}) {
  const low = boundedNumber(minValue, min, max, min);
  const high = boundedNumber(maxValue, min, max, max);

  const update = (handle: "min" | "max", rawValue: string) => {
    const next = boundedNumber(rawValue, min, max, handle === "min" ? low : high);
    if (handle === "min") onChange(String(Math.min(next, high)), String(high));
    else onChange(String(low), String(Math.max(next, low)));
  };

  return (
    <fieldset className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
      <legend className="px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[8px] text-slate-500">
          <span className="flex items-center justify-between gap-1">Min <output className="font-mono text-cyan-200">{formatValue(low)}</output></span>
          <input type="range" min={min} max={max} step={step} value={low} aria-label={`Minimum ${label}`} onChange={(event) => update("min", event.target.value)} className={rangeClass} />
        </label>
        <label className="block text-[8px] text-slate-500">
          <span className="flex items-center justify-between gap-1">Max <output className="font-mono text-cyan-200">{formatValue(high)}</output></span>
          <input type="range" min={min} max={max} step={step} value={high} aria-label={`Maximum ${label}`} onChange={(event) => update("max", event.target.value)} className={rangeClass} />
        </label>
      </div>
    </fieldset>
  );
}

export function WheelFilterPanel({
  filterValues,
  setFilterValues,
  sectors,
  onSubmit,
  onReset,
}: {
  filterValues: WheelFilterState;
  setFilterValues: Dispatch<SetStateAction<WheelFilterState>>;
  sectors: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}) {
  const update = <K extends keyof WheelFilterState>(key: K, value: WheelFilterState[K]) => {
    setFilterValues((current) => ({ ...current, [key]: value }));
  };
  const updateRange = (minKey: "dteMin" | "deltaMin", maxKey: "dteMax" | "deltaMax", minValue: string, maxValue: string) => {
    setFilterValues((current) => ({ ...current, [minKey]: minValue, [maxKey]: maxValue }));
  };
  const sectorOptions = [...new Set([
    ...sectors.filter((sector) => sector.trim().length > 0),
    ...(filterValues.sector !== "all" ? [filterValues.sector] : []),
  ])].sort((a, b) => a.localeCompare(b));
  const maxCollateral = boundedNumber(filterValues.maxCollateral, 10_000, 100_000, 50_000);
  const summaryDteMin = boundedNumber(filterValues.dteMin, 7, 70, 21);
  const summaryDteMax = boundedNumber(filterValues.dteMax, 7, 70, 50);
  const summaryDeltaMin = boundedNumber(filterValues.deltaMin, 0.01, 0.5, 0.15);
  const summaryDeltaMax = boundedNumber(filterValues.deltaMax, 0.01, 0.5, 0.3);

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3 className="text-xs font-bold text-white">Scanner filters</h3>
          <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">
            Tune the saved provider scans, then apply once. These controls do not start a new provider scan; the automatic chain window is 7–70 DTE and absolute delta up to 0.50.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onReset} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:text-white">Reset</button>
          <button className="rounded-lg bg-cyan-600 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-500">Apply filters</button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Stock grade
          <select value={filterValues.grade} onChange={(event) => setFilterValues((current) => ({ ...current, grade: event.target.value, gradeMatch: event.target.value === "all" ? "minimum" : current.gradeMatch }))} className={inputClass + " mt-1"}>
            <option value="A+">A+</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="all">All saved graded scans</option>
          </select>
        </label>
        <label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Grade matching
          <select value={filterValues.gradeMatch} onChange={(event) => update("gradeMatch", event.target.value as WheelFilterState["gradeMatch"])} className={inputClass + " mt-1"}>
            <option value="minimum">This grade or higher</option><option value="exact" disabled={filterValues.grade === "all"}>Exact grade only</option>
          </select>
        </label>
        <label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Rank results by
          <select value={filterValues.sortBy} onChange={(event) => update("sortBy", event.target.value as WheelFilterState["sortBy"])} className={inputClass + " mt-1"}>
            <option value="score">Best overall score</option><option value="annRoc">Highest annualized ROC</option>
          </select>
        </label>
        <label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Account-fit hint
          <select value={filterValues.account} onChange={(event) => update("account", event.target.value)} className={inputClass + " mt-1"}>
            <option value="all">All</option><option value="R">Retirement · R</option><option value="T">Taxable · T</option>
          </select>
        </label>
        <label className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Minimum open interest
          <input type="number" min="0" max="100000" step="1" value={filterValues.minOi} onChange={(event) => update("minOi", event.target.value)} className={inputClass + " mt-1"} />
        </label>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Provider-backed sector</div>
        <div className="flex flex-wrap gap-1.5">
          {["all", ...sectorOptions].map((sector) => {
            const selected = filterValues.sector === sector;
            return (
              <button
                key={sector}
                type="button"
                aria-pressed={selected}
                onClick={() => update("sector", sector)}
                className={`rounded-full border px-2.5 py-1.5 text-[10px] transition-colors ${selected ? "border-emerald-400/40 bg-emerald-500/15 font-semibold text-emerald-200" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-200"}`}
              >
                {sector === "all" ? "All sectors" : sector}
              </button>
            );
          })}
          {sectorOptions.length === 0 && <span className="px-2 py-1 text-[10px] text-slate-600">Sector data will appear when stock fundamentals are hydrated.</span>}
        </div>
      </div>

      <div className="mt-4 grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField label="Minimum score" value={filterValues.minScore} min={0} max={100} step={1} onChange={(value) => update("minScore", value)} />
        <NumberField label="Maximum bid/ask spread · %" value={filterValues.maxSpread} min={1} max={100} step={1} onChange={(value) => update("maxSpread", value)} />
        <NumberField label="Minimum annualized ROC · %" value={filterValues.minReturn} min={0} max={500} step={1} onChange={(value) => update("minReturn", value)} />
      </div>

      <details className="group mt-3 rounded-xl border border-slate-800 bg-slate-950/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-950/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-[10px] font-bold text-slate-200">Range filters</span>
            <span className="mt-0.5 block truncate text-[9px] text-slate-500 sm:whitespace-normal">
              DTE {summaryDteMin}–{summaryDteMax}d · |Δ| {summaryDeltaMin.toFixed(2)}–{summaryDeltaMax.toFixed(2)} · Cash cap {filterValues.maxCollateralEnabled ? `$${maxCollateral.toLocaleString("en-US")}` : "off"}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid items-start gap-2 border-t border-slate-800 p-2 sm:grid-cols-2 xl:grid-cols-3">
          <RangeSliderField
            label="Days to expiration"
            minValue={filterValues.dteMin}
            maxValue={filterValues.dteMax}
            min={7}
            max={70}
            step={1}
            formatValue={(value) => `${value}d`}
            onChange={(minValue, maxValue) => updateRange("dteMin", "dteMax", minValue, maxValue)}
          />
          <RangeSliderField
            label="Absolute put delta"
            minValue={filterValues.deltaMin}
            maxValue={filterValues.deltaMax}
            min={0.01}
            max={0.5}
            step={0.01}
            formatValue={(value) => value.toFixed(2)}
            onChange={(minValue, maxValue) => updateRange("deltaMin", "deltaMax", minValue, maxValue)}
          />
          <fieldset className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
            <legend className="px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Cash secured per contract</legend>
            <label className="flex items-center gap-2 text-[9px] text-slate-300">
              <input type="checkbox" checked={filterValues.maxCollateralEnabled} onChange={(event) => update("maxCollateralEnabled", event.target.checked)} className="accent-emerald-500" />
              Apply maximum collateral cap
            </label>
            {filterValues.maxCollateralEnabled ? (
              <div className="mt-2">
                <SliderField
                  label="Maximum collateral"
                  value={maxCollateral}
                  min={10_000}
                  max={100_000}
                  step={2_500}
                  valueLabel={`$${maxCollateral.toLocaleString("en-US")}`}
                  minLabel="$10k"
                  maxLabel="$100k"
                  onChange={(value) => update("maxCollateral", value)}
                />
                <p className="mt-1.5 text-[8px] leading-relaxed text-slate-600">Applied per contract before ranking alternatives.</p>
              </div>
            ) : (
              <p className="mt-1.5 text-[8px] text-slate-600">No collateral cap is applied.</p>
            )}
          </fieldset>
        </div>
        <p className="px-3 pb-2 text-[8px] text-slate-600">Range bounds match the stored option scans: 7–70 DTE and absolute put delta up to 0.50.</p>
      </details>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.earnings} onChange={(event) => update("earnings", event.target.checked)} className="accent-emerald-500" />Allow expiration on/after earnings</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.trend} onChange={(event) => update("trend", event.target.checked)} className="accent-emerald-500" />Require above 200-day SMA</label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.dividendOnly} onChange={(event) => update("dividendOnly", event.target.checked)} className="accent-emerald-500" />Dividend stocks only</label>
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-slate-600">Live results use source-backed fields only. The legacy sample-only undervaluation and wide-moat toggles are intentionally not represented here.</p>
    </form>
  );
}
