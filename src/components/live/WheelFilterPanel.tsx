import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { WheelFilterState } from "./wheel-filter-state";

const inputClass = "w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60";
const rangeClass = "mt-2 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40";

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
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
  disabled = false,
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
  disabled?: boolean;
}) {
  return (
    <label className={`block rounded-lg border border-slate-800 bg-slate-950/70 p-3 ${disabled ? "opacity-70" : ""}`}>
      <span className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <output className="font-mono text-xs font-bold normal-case tracking-normal text-cyan-200">{disabled ? "No cap" : valueLabel}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={rangeClass}
      />
      <span className="mt-1 flex justify-between text-[9px] text-slate-600"><span>{minLabel}</span><span>{maxLabel}</span></span>
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
  hint,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (minValue: string, maxValue: string) => void;
  formatValue: (value: number) => string;
  hint: string;
}) {
  const low = boundedNumber(minValue, min, max, min);
  const high = boundedNumber(maxValue, min, max, max);

  const update = (handle: "min" | "max", rawValue: string) => {
    const next = boundedNumber(rawValue, min, max, handle === "min" ? low : high);
    if (handle === "min") onChange(String(Math.min(next, high)), String(high));
    else onChange(String(low), String(Math.max(next, low)));
  };

  return (
    <fieldset className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[9px] text-slate-500">
          <span className="flex items-center justify-between gap-2">Minimum <output className="font-mono text-cyan-200">{formatValue(low)}</output></span>
          <input type="range" min={min} max={max} step={step} value={low} aria-label={`Minimum ${label}`} onChange={(event) => update("min", event.target.value)} className={rangeClass} />
        </label>
        <label className="block text-[9px] text-slate-500">
          <span className="flex items-center justify-between gap-2">Maximum <output className="font-mono text-cyan-200">{formatValue(high)}</output></span>
          <input type="range" min={min} max={max} step={step} value={high} aria-label={`Maximum ${label}`} onChange={(event) => update("max", event.target.value)} className={rangeClass} />
        </label>
      </div>
      <p className="mt-1 text-[9px] leading-relaxed text-slate-600">{hint}</p>
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RangeSliderField
          label="Days to expiration"
          minValue={filterValues.dteMin}
          maxValue={filterValues.dteMax}
          min={7}
          max={70}
          step={1}
          formatValue={(value) => `${value}d`}
          onChange={(minValue, maxValue) => updateRange("dteMin", "dteMax", minValue, maxValue)}
          hint="Matches the DTE window used by automatic option-chain scans."
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
          hint="Provider scans store puts through 0.50 absolute delta."
        />
        <SliderField
          label="Minimum score"
          value={boundedNumber(filterValues.minScore, 0, 100, 15)}
          min={0}
          max={100}
          step={1}
          valueLabel={filterValues.minScore}
          minLabel="0"
          maxLabel="100"
          onChange={(value) => update("minScore", value)}
        />
        <SliderField
          label="Maximum bid/ask spread"
          value={boundedNumber(filterValues.maxSpread, 1, 100, 10)}
          min={1}
          max={100}
          step={1}
          valueLabel={`${filterValues.maxSpread}%`}
          minLabel="1%"
          maxLabel="100%"
          onChange={(value) => update("maxSpread", value)}
        />
        <SliderField
          label="Minimum annualized ROC"
          value={boundedNumber(filterValues.minReturn, 0, 500, 8)}
          min={0}
          max={500}
          step={1}
          valueLabel={`${filterValues.minReturn}%`}
          minLabel="0%"
          maxLabel="500%"
          onChange={(value) => update("minReturn", value)}
        />
        <fieldset className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cash secured per contract</legend>
          <label className="flex items-center gap-2 text-[10px] text-slate-300">
            <input type="checkbox" checked={filterValues.maxCollateralEnabled} onChange={(event) => update("maxCollateralEnabled", event.target.checked)} className="accent-emerald-500" />
            Apply maximum collateral cap
          </label>
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
              disabled={!filterValues.maxCollateralEnabled}
            />
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-slate-600">The cap is applied to each contract before ranking alternatives for a ticker.</p>
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.earnings} onChange={(event) => update("earnings", event.target.checked)} className="accent-emerald-500" />Allow expiration on/after earnings</label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.trend} onChange={(event) => update("trend", event.target.checked)} className="accent-emerald-500" />Require above 200-day SMA</label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] text-slate-300"><input type="checkbox" checked={filterValues.dividendOnly} onChange={(event) => update("dividendOnly", event.target.checked)} className="accent-emerald-500" />Dividend stocks only</label>
        </div>
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-slate-600">Live results use source-backed fields only. The legacy sample-only undervaluation and wide-moat toggles are intentionally not represented here.</p>
    </form>
  );
}
