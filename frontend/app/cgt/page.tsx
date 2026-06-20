"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, ApiError, CGTReport } from "@/lib/api";
import { formatAUD, formatDate, gainColour } from "@/lib/format";
import UpgradePrompt from "@/components/UpgradePrompt";
import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionsManager from "@/components/TransactionsManager";

export default function CGTPage() {
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedTaxYear = searchParams.get("tax_year") || "";

  const [report, setReport] = useState<CGTReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    document.title = "Capital Gains — WealthTrack AU";
  }, []);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getCGTReport(token, selectedTaxYear || undefined);
      setReport(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setIsLocked(true);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedTaxYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentFY = (() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
  })();

  const handleYearChange = (year: string) => {
    if (year === "") {
      router.push("/cgt");
    } else {
      router.push(`/cgt?tax_year=${year}`);
    }
  };

  const years = [
    { label: `${currentFY} (Current)`, value: "" },
    { label: "2024-25", value: "2024-25" },
    { label: "2023-24", value: "2023-24" },
    { label: "2022-23", value: "2022-23" },
  ];

  if (loading && !report) {
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-semibold">Capital Gains Tax Report</h1>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
          >
            + Add Trade (Buy/Sell)
          </button>

          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Tax Year:</span>
            <select
              value={selectedTaxYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {years.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadData}
          defaultType="Buy"
          allowedAccountTypes={["Brokerage", "Super"]}
        />
      )}

      {report && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="stat-label mb-1">Total Gross Gain</p>
            <p className={`text-xl font-semibold ${gainColour(report.total_gross_gain)}`}>
              {formatAUD(report.total_gross_gain)}
            </p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">Taxable Gain (after discount)</p>
            <p className="text-xl font-semibold text-blue-400">
              {formatAUD(report.total_taxable_gain)}
            </p>
          </div>
          <div className="card text-center">
            <p className="stat-label mb-1">Capital Losses</p>
            <p className="text-xl font-semibold text-red-400">
              {formatAUD(Math.abs(report.total_losses))}
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <p className="stat-label mb-3">Disposal Events (FIFO)</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th text-left">Asset</th>
                <th className="table-th">Sell Date</th>
                <th className="table-th">Buy Date</th>
                <th className="table-th">Days Held</th>
                <th className="table-th">Units</th>
                <th className="table-th">Cost Base</th>
                <th className="table-th">Proceeds</th>
                <th className="table-th">Gross Gain</th>
                <th className="table-th">50% Disc.</th>
                <th className="table-th">Taxable Gain</th>
                <th className="table-th">FY</th>
              </tr>
            </thead>
            <tbody>
              {!report || report.events.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-slate-500 text-sm py-8">
                    No disposal events found for this period.
                  </td>
                </tr>
              ) : (
                report.events.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="table-td text-left font-medium text-slate-900 dark:text-slate-100">{e.asset_ticker}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatDate(e.sell_date)}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatDate(e.buy_date)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{e.holding_days}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{Number(e.units_disposed).toFixed(4)}</td>
                    <td className="table-td text-slate-600 dark:text-slate-400">{formatAUD(e.cost_base)}</td>
                    <td className="table-td text-slate-700 dark:text-slate-300">{formatAUD(e.gross_proceeds)}</td>
                    <td className={`table-td font-medium ${gainColour(e.gross_gain)}`}>{formatAUD(e.gross_gain)}</td>
                    <td className="table-td text-center">
                      {e.discount_applied ? (
                        <span className="text-emerald-400 text-xs font-medium">✓</span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className={`table-td font-semibold ${gainColour(e.taxable_gain)}`}>{formatAUD(e.taxable_gain)}</td>
                    <td className="table-td text-slate-500 text-xs">{e.tax_year}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-600 mt-4">
          CGT method: FIFO. 50% discount applies to disposals held &gt; 365 days (s115-100 ITAA97). Cost base includes brokerage per ATO rules.
        </p>
      </div>

      {isLocked && (
        <UpgradePrompt
          feature="Full CGT History"
          description="Access CGT reports for all financial years. Free plan shows the current FY only."
        />
      )}

      {/* Interactive Equity Transactions ledger to manage entries */}
      <TransactionsManager
        transactionTypes={["Buy", "Sell"]}
        accountTypes={["Brokerage", "Super"]}
        title="Equity Trade Ledger (Buy / Sell Entries)"
        onSaved={loadData}
      />
    </div>
  );
}
