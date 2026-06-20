"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, DividendSummary } from "@/lib/api";
import { formatAUD, formatDate, gainColour } from "@/lib/format";
import UpgradePrompt from "@/components/UpgradePrompt";
import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionsManager from "@/components/TransactionsManager";

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function DividendCalendar({ dividends }: { dividends: DividendSummary[] }) {
  const currentYear = new Date().getFullYear();
  const byMonth: Record<number, number> = {};
  for (const d of dividends) {
    const dt = new Date(d.date);
    if (dt.getFullYear() === currentYear) {
      const m = dt.getMonth();
      byMonth[m] = (byMonth[m] ?? 0) + Number(d.net_amount);
    }
  }
  const max = Math.max(...Object.values(byMonth), 1);

  return (
    <div className="card">
      <p className="stat-label mb-4">Dividend Calendar — {currentYear}</p>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
        {MONTH_ABBR.map((abbr, i) => {
          const amount = byMonth[i] ?? 0;
          const intensity = amount > 0 ? 0.15 + 0.85 * (amount / max) : 0;
          return (
            <div key={abbr} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-full aspect-square rounded-md flex items-center justify-center text-[10px] font-medium border transition-colors ${
                  amount > 0
                    ? "text-emerald-950 dark:text-emerald-100 border-emerald-500/20"
                    : "bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-850"
                }`}
                style={amount > 0 ? { backgroundColor: `rgba(16,185,129,${intensity})` } : undefined}
                title={amount > 0 ? `${abbr}: ${formatAUD(amount)}` : `${abbr}: no dividends`}
              >
                {amount > 0 ? formatAUD(amount, true) : "—"}
              </div>
              <span className="text-[9px] text-slate-500 dark:text-slate-400">{abbr}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-600 mt-3">Darker green = higher dividend income for that month.</p>
    </div>
  );
}

export default function DividendsPage() {
  const { getToken } = useAuth();
  const [dividends, setDividends] = useState<DividendSummary[]>([]);
  const [fySummary, setFySummary] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    document.title = "Dividends — WealthTrack AU";
  }, []);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [divs, summary] = await Promise.all([
        api.getDividends(token),
        api.getDividendFYSummary(token),
      ]);
      setDividends(divs);
      setFySummary(summary);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setIsLocked(true);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLocked) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Dividends</h1>
        <UpgradePrompt
          feature="Dividend Tracker"
          description="Track all dividends with franking credit gross-ups, yield-on-cost, and FY summaries. Essential for Australian tax returns."
        />
      </div>
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

  const totalNet = dividends.reduce((a, d) => a + Number(d.net_amount), 0);
  const totalFranking = dividends.reduce((a, d) => a + Number(d.franking_credit), 0);
  const totalGross = dividends.reduce((a, d) => a + Number(d.gross_amount), 0);

  const fYears = Object.keys(fySummary).sort().reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dividends</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
        >
          + Add Dividend
        </button>
      </div>

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadData}
          defaultType="Dividend"
          allowedAccountTypes={["Brokerage", "Super", "Cash"]}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="stat-label mb-1">Total Net Dividends</p>
          <p className="stat-value text-emerald-400">{formatAUD(totalNet)}</p>
        </div>
        <div className="card text-center">
          <p className="stat-label mb-1">Total Franking Credits</p>
          <p className="stat-value text-blue-400">{formatAUD(totalFranking)}</p>
        </div>
        <div className="card text-center">
          <p className="stat-label mb-1">Gross Dividend Income</p>
          <p className="stat-value text-slate-900 dark:text-slate-100">{formatAUD(totalGross)}</p>
          <p className="text-xs text-slate-500 mt-1">Net + Franking credits</p>
        </div>
      </div>

      {/* Calendar */}
      <DividendCalendar dividends={dividends} />

      {/* FY Summary */}
      {fYears.length > 0 && (
        <div className="card">
          <p className="stat-label mb-3">Financial Year Summary (Jul – Jun)</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th text-left">FY</th>
                  <th className="table-th">ETFs</th>
                  <th className="table-th">Stocks</th>
                  <th className="table-th">Managed Funds</th>
                  <th className="table-th">Crypto</th>
                  <th className="table-th">Total</th>
                </tr>
              </thead>
              <tbody>
                {fYears.map((fy) => {
                  const row = fySummary[fy];
                  return (
                    <tr key={fy} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="table-td text-left font-medium text-slate-700 dark:text-slate-300">FY {fy}</td>
                      <td className="table-td text-emerald-600 dark:text-emerald-400">{formatAUD(row.ETF ?? 0)}</td>
                      <td className="table-td text-blue-600 dark:text-blue-400">{formatAUD(row.Stock ?? 0)}</td>
                      <td className="table-td text-violet-600 dark:text-violet-400">{formatAUD(row["Managed Fund"] ?? 0)}</td>
                      <td className="table-td text-amber-600 dark:text-amber-400">{formatAUD(row.Crypto ?? 0)}</td>
                      <td className="table-td font-semibold text-slate-900 dark:text-slate-100">{formatAUD(row.total ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Ledger */}
      <TransactionsManager
        transactionTypes={["Dividend"]}
        title="Dividend Ledger"
        onSaved={loadData}
      />
      <p className="text-xs text-slate-500 -mt-2">
        Franking credit = net dividend × (franking% / 100) × (30/70). Gross-up at 30% corporate tax rate (ATO).
      </p>
    </div>
  );
}
