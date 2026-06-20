"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, PropertyMetrics, Account } from "@/lib/api";
import { formatAUD, gainColour } from "@/lib/format";
import LVRGauge from "@/components/LVRGauge";
import AddTransactionModal from "@/components/AddTransactionModal";
import TransactionsManager from "@/components/TransactionsManager";

export default function PropertyPage() {
  const { getToken } = useAuth();
  const [properties, setProperties] = useState<PropertyMetrics[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined);

  useEffect(() => {
    document.title = "Property — WealthTrack AU";
  }, []);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [propsData, acctsData] = await Promise.all([
        api.getProperty(token).catch(() => []),
        api.listAccounts(token).catch(() => []),
      ]);
      setProperties(propsData);
      setAccounts(acctsData);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  const totalEquity     = properties.reduce((a, p) => a + p.net_equity, 0);
  const totalValue      = properties.reduce((a, p) => a + p.current_valuation, 0);
  const totalMortgage   = properties.reduce((a, p) => a + p.mortgage_balance, 0);
  const totalGrowth     = properties.reduce((a, p) => a + p.total_growth, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Property</h1>
        <button
          onClick={() => {
            setSelectedAccountId(undefined);
            setShowAddModal(true);
          }}
          className="text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
        >
          + Add Property Transaction
        </button>
      </div>

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadData}
          defaultAccountId={selectedAccountId}
          allowedAccountTypes={["Property"]}
        />
      )}

      {/* Portfolio KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card">
          <p className="stat-label mb-1">Total Equity</p>
          <p className="stat-value text-emerald-400">{formatAUD(totalEquity)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Total Value</p>
          <p className="stat-value">{formatAUD(totalValue)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Total Mortgage</p>
          <p className="stat-value text-red-400">{formatAUD(totalMortgage)}</p>
        </div>
        <div className="card">
          <p className="stat-label mb-1">Total Growth</p>
          <p className={`stat-value ${gainColour(totalGrowth)}`}>{formatAUD(totalGrowth)}</p>
        </div>
      </div>

      {/* Property cards */}
      {properties.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 mb-2">No properties found.</p>
          <p className="text-sm text-slate-600">Add property accounts and transactions to track equity and LVR here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {properties.map((prop) => {
            const mortgagePct = prop.purchase_price > 0
              ? Math.min((prop.net_equity / prop.purchase_price) * 100, 100)
              : 0;

            const matchedAccount = accounts.find(
              (a) => a.name === prop.account_name && a.type === "Property"
            );
            const accountId = matchedAccount?.id;

            return (
              <div key={prop.account_name} className="card space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{prop.account_name}</h2>
                      {accountId && (
                        <button
                          onClick={() => {
                            setSelectedAccountId(accountId);
                            setShowAddModal(true);
                          }}
                          className="text-[10px] text-emerald-500 hover:text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/50 px-1.5 py-0.5 rounded transition-colors"
                        >
                          + Add Entry
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Purchased {formatAUD(prop.purchase_price)}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${gainColour(prop.total_growth)}`}>
                    {prop.total_growth >= 0 ? "+" : ""}{formatAUD(prop.total_growth)}
                  </span>
                </div>

                {/* Valuation vs Mortgage */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-100 dark:bg-slate-800/60 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Current Value</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatAUD(prop.current_valuation)}</p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800/60 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Mortgage</p>
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">{formatAUD(prop.mortgage_balance)}</p>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800/60 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Equity</p>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatAUD(prop.net_equity)}</p>
                  </div>
                </div>

                {/* LVR Gauge */}
                <div className="flex flex-col items-center py-2">
                  <LVRGauge lvr={prop.lvr} size={160} />
                  <p className="text-xs text-slate-650 dark:text-slate-400 mt-2 text-center">
                    Loan-to-Value Ratio — lenders typically require &lt;80% for no LMI
                  </p>
                </div>

                {/* Equity build progress (vs purchase price) */}
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Equity build</span>
                    <span>{mortgagePct.toFixed(1)}% of purchase price</span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${mortgagePct}%` }}
                    />
                  </div>
                </div>

                {/* Annual interest / principal */}
                {(prop.total_interest_fees_paid > 0 || prop.total_principal_paid > 0) && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-850">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Total Interest Paid</p>
                      <p className="text-sm text-red-400 font-medium">{formatAUD(prop.total_interest_fees_paid)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Principal Repaid</p>
                      <p className="text-sm text-emerald-400 font-medium">{formatAUD(prop.total_principal_paid)}</p>
                    </div>
                  </div>
                )}

                {/* Collapsible Ledger */}
                {accountId && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 select-none">
                        <span>PROPERTY TRANSACTIONS LEDGER</span>
                        <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="mt-3">
                        <TransactionsManager
                          accountId={accountId}
                          title={`${prop.account_name} Entries`}
                          onSaved={loadData}
                        />
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
