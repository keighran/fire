"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { api, Holding } from "@/lib/api";
import { formatAUD, gainColour } from "@/lib/format";
import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionsManager from "@/components/TransactionsManager";

const CLASS_COLOURS: Record<string, string> = {
  ETF:            "bg-emerald-500",
  Stock:          "bg-blue-500",
  "Managed Fund": "bg-violet-500",
  Crypto:         "bg-amber-500",
  Other:          "bg-slate-500",
};

const CLASS_TEXT: Record<string, string> = {
  ETF:            "text-emerald-600 dark:text-emerald-400",
  Stock:          "text-blue-600 dark:text-blue-400",
  "Managed Fund": "text-violet-600 dark:text-violet-400",
  Crypto:         "text-amber-600 dark:text-amber-400",
  Other:          "text-slate-500 dark:text-slate-400",
};

type SortKey = keyof Pick<Holding, "ticker" | "market_value" | "unrealised_gain_pct" | "annualised_return_pct" | "cost_base" | "dividend_yield_on_cost">;

function AllocationBar({ holdings }: { holdings: Holding[] }) {
  const total = holdings.reduce((a, h) => a + h.market_value, 0);
  if (total === 0) return null;

  const byClass: Record<string, number> = {};
  for (const h of holdings) {
    byClass[h.asset_class] = (byClass[h.asset_class] ?? 0) + h.market_value;
  }

  return (
    <div className="card">
      <p className="stat-label mb-4">Portfolio Allocation</p>
      <div className="h-4 rounded-full overflow-hidden flex gap-0.5">
        {Object.entries(byClass).map(([cls, val]) => (
          <div
            key={cls}
            className={`h-full ${CLASS_COLOURS[cls] ?? "bg-slate-500"} transition-all`}
            style={{ width: `${(val / total) * 100}%` }}
            title={`${cls}: ${formatAUD(val)} (${((val / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
        {Object.entries(byClass).map(([cls, val]) => (
          <div key={cls} className="flex items-center gap-2 text-xs">
            <span className={`w-2.5 h-2.5 rounded-sm ${CLASS_COLOURS[cls] ?? "bg-slate-500"}`} />
            <span className="text-slate-500 dark:text-slate-400">{cls}</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">{((val / total) * 100).toFixed(1)}%</span>
            <span className="text-slate-500 dark:text-slate-500">{formatAUD(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { getToken } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("market_value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterClass, setFilterClass] = useState<string>("All");
  const [showRetirement, setShowRetirement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [tab, setTab] = useState<"holdings" | "transactions">("holdings");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const data = await api.getHoldings(token).catch(() => []);
    setHoldings(data);
    setLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      const token = await getToken();
      if (token) await api.refreshPrices(token).catch(() => null);
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const growthHoldings = holdings.filter((h) => !h.is_retirement);
  const retirementHoldings = holdings.filter((h) => h.is_retirement);
  const displayedAll = showRetirement ? holdings : growthHoldings;
  const classes = ["All", ...Array.from(new Set(displayedAll.map((h) => h.asset_class)))];

  const filtered = displayedAll
    .filter((h) => filterClass === "All" || h.asset_class === filterClass)
    .sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = va as number;
      const nb = vb as number;
      return sortDir === "asc" ? na - nb : nb - na;
    });

  const totalValue   = filtered.reduce((a, h) => a + h.market_value, 0);
  const totalCost    = filtered.reduce((a, h) => a + h.cost_base, 0);
  const totalGain    = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const totalDivs    = filtered.reduce((a, h) => a + h.total_dividends_received, 0);

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-slate-700 ml-1">↕</span>;
    return <span className="text-emerald-400 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function Th({ k, label, right = true }: { k: SortKey; label: string; right?: boolean }) {
    return (
      <th
        className={`table-th cursor-pointer select-none hover:text-slate-200 ${right ? "text-right" : "text-left"}`}
        onClick={() => toggleSort(k)}
      >
        {label}<SortIcon k={k} />
      </th>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTxnModal(true)}
            className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
          >
            + Add Transaction
          </button>
          <button
            onClick={handleRefreshPrices}
            disabled={refreshing}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-700 px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh Prices"}
          </button>
        </div>
      </div>

      {showTxnModal && (
        <AddTransactionModal
          onClose={() => setShowTxnModal(false)}
          onSaved={load}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-lg w-fit">
        {(["holdings", "transactions"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "transactions" ? (
        <TransactionsManager />
      ) : (<>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="stat-label mb-1">Market Value</p>
          <p className="stat-value">{formatAUD(totalValue)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Total Cost</p>
          <p className="stat-value text-slate-700 dark:text-slate-300">{formatAUD(totalCost)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Unrealised Gain</p>
          <p className={`stat-value ${gainColour(totalGain)}`}>
            {formatAUD(totalGain)}
            <span className="text-sm ml-2 font-normal">{totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}%</span>
          </p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Dividends Received</p>
          <p className="stat-value text-blue-400">{formatAUD(totalDivs)}</p>
        </div>
      </div>

      {/* Allocation bar */}
      <AllocationBar holdings={filtered} />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {classes.map((cls) => (
            <button
              key={cls}
              onClick={() => setFilterClass(cls)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterClass === cls
                  ? "bg-emerald-600 dark:bg-emerald-700 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {cls}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 ml-auto text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showRetirement}
            onChange={(e) => setShowRetirement(e.target.checked)}
            className="accent-emerald-500"
          />
          Include Super / Retirement ({retirementHoldings.length})
        </label>
      </div>

      {/* Holdings table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th k="ticker" label="Ticker" right={false} />
                <th className="table-th text-left">Class</th>
                <th className="table-th text-right">Units</th>
                <th className="table-th text-right">Price</th>
                <Th k="market_value" label="Value" />
                <Th k="cost_base" label="Cost Base" />
                <th className="table-th text-right">Unrealised $</th>
                <Th k="unrealised_gain_pct" label="Unreal %" />
                <Th k="annualised_return_pct" label="Ann. Return" />
                <Th k="dividend_yield_on_cost" label="Div Yield" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-slate-500 text-sm py-10">
                    No holdings found. Add BUY transactions to see your portfolio here.
                  </td>
                </tr>
              ) : (
                filtered.map((h) => (
                  <tr key={h.ticker + h.asset_class} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="table-td text-left">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{h.ticker}</span>
                        {h.is_retirement && (
                          <span className="ml-1.5 text-[9px] text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 px-1 py-0.5 rounded border border-amber-200 dark:border-transparent">SUPER</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[120px]">{h.name}</div>
                    </td>
                    <td className="table-td text-left">
                      <span className={`text-xs font-medium ${CLASS_TEXT[h.asset_class] ?? "text-slate-400"}`}>
                        {h.asset_class}
                      </span>
                    </td>
                    <td className="table-td text-right text-slate-600 dark:text-slate-400">
                      {h.total_units.toLocaleString("en-AU", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="table-td text-right text-slate-700 dark:text-slate-300">
                      {formatAUD(h.current_price)}
                    </td>
                    <td className="table-td text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatAUD(h.market_value)}
                    </td>
                    <td className="table-td text-right text-slate-600 dark:text-slate-400">
                      {formatAUD(h.cost_base)}
                    </td>
                    <td className={`table-td text-right font-medium ${gainColour(h.unrealised_gain)}`}>
                      {h.unrealised_gain >= 0 ? "+" : ""}{formatAUD(h.unrealised_gain)}
                    </td>
                    <td className={`table-td text-right font-medium ${gainColour(h.unrealised_gain_pct)}`}>
                      {h.unrealised_gain_pct >= 0 ? "+" : ""}{h.unrealised_gain_pct.toFixed(1)}%
                    </td>
                    <td className={`table-td text-right ${gainColour(h.annualised_return_pct)}`}>
                      {h.annualised_return_pct >= 0 ? "+" : ""}{h.annualised_return_pct.toFixed(1)}%
                    </td>
                    <td className="table-td text-right text-blue-400">
                      {h.dividend_yield_on_cost.toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="table-td text-left font-semibold text-slate-700 dark:text-slate-300" colSpan={4}>Total</td>
                  <td className="table-td text-right font-bold text-slate-900 dark:text-slate-100">{formatAUD(totalValue)}</td>
                  <td className="table-td text-right font-semibold text-slate-600 dark:text-slate-400">{formatAUD(totalCost)}</td>
                  <td className={`table-td text-right font-bold ${gainColour(totalGain)}`}>
                    {totalGain >= 0 ? "+" : ""}{formatAUD(totalGain)}
                  </td>
                  <td className={`table-td text-right font-bold ${gainColour(totalGainPct)}`}>
                    {totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}%
                  </td>
                  <td className="table-td" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </>)}
    </div>
  );
}
