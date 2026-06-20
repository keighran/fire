"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, SideIncomeMonth } from "@/lib/api";
import { formatAUD } from "@/lib/format";
import SideIncomeChart from "@/components/SideIncomeChart";
import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionsManager from "@/components/TransactionsManager";

export default function SideIncomePage() {
  const { getToken } = useAuth();
  const [monthly, setMonthly] = useState<SideIncomeMonth[]>([]);
  const [rollingAvg, setRollingAvg] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    document.title = "Side Income — WealthTrack AU";
  }, []);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [monthlyData, rollingData] = await Promise.all([
        api.getSideIncomeMonthly(token).catch(() => []),
        api.getSideIncomeRollingAvg(token).catch(() => ({ rolling_365_avg: 0 })),
      ]);
      setMonthly(monthlyData);
      setRollingAvg(rollingData?.rolling_365_avg ?? 0);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && monthly.length === 0 && rollingAvg === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  // Derive FY YTD from monthly data (Australian FY: Jul–Jun)
  const now = new Date();
  const fyStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const fyYtd = monthly
    .filter((m) => {
      const [year, month] = m.month.split("-").map(Number);
      return year > fyStart || (year === fyStart && month >= 7);
    })
    .reduce((a, m) => a + m.amount, 0);

  const monthsElapsed = now.getMonth() >= 6
    ? now.getMonth() - 6 + 1
    : now.getMonth() + 7;
  const predictedYearly = monthsElapsed > 0 ? (fyYtd / monthsElapsed) * 12 : 0;

  const totalAllTime = monthly.reduce((a, m) => a + m.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Side Income</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
        >
          + Add Side Income
        </button>
      </div>

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadData}
          defaultType="Income"
          allowedAccountTypes={["Cash", "Other Asset"]}
        />
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="stat-label mb-1">365-Day Avg / Month</p>
          <p className="stat-value text-violet-400">{formatAUD(rollingAvg)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Annualised (×12)</p>
          <p className="stat-value text-emerald-400">{formatAUD(rollingAvg * 12)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">FY YTD</p>
          <p className="stat-value">{formatAUD(fyYtd)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Predicted This FY</p>
          <p className="stat-value text-amber-400">{formatAUD(predictedYearly)}</p>
        </div>
      </div>

      {/* Monthly bar chart */}
      <SideIncomeChart data={monthly} rollingAvg={rollingAvg} />

      {/* All-time summary */}
      <div className="card">
        <p className="stat-label mb-3">All Time</p>
        {monthly.length === 0 ? (
          <p className="text-sm text-slate-500">
            No side income recorded yet. Add INCOME-type transactions to non-employment accounts to track them here.
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-650 dark:text-slate-405">Total side income recorded</span>
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatAUD(totalAllTime)}</span>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">
          Rolling 365-day average excludes employment salary. Includes rental income, freelance, dividends classified as side income.
        </p>
      </div>

      {/* Side Income Transactions Ledger */}
      <TransactionsManager
        transactionTypes={["Income"]}
        accountTypes={["Cash", "Other Asset"]}
        title="Side Income Entries Ledger (Non-employment Income)"
        onSaved={loadData}
      />
    </div>
  );
}
