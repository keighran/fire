"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, TransactionRow, Account, Asset } from "@/lib/api";
import { formatAUD } from "@/lib/format";

const TXN_TYPES = ["Buy", "Sell", "Deposit", "Withdrawal", "Dividend", "Interest", "Expense", "Income"] as const;

const TYPE_COLOUR: Record<string, string> = {
  Buy:        "text-emerald-400",
  Sell:       "text-red-400",
  Deposit:    "text-blue-400",
  Withdrawal: "text-orange-400",
  Dividend:   "text-violet-400",
  Interest:   "text-cyan-400",
  Expense:    "text-red-355", // custom styled red
  Income:     "text-emerald-300",
};

interface EditModal {
  txn: TransactionRow;
  form: {
    type: string;
    date: string;
    amount: string;
    units: string;
    price_per_unit: string;
    fees: string;
    notes: string;
    asset_id: number;
    franking_percentage: string;
    is_drp: boolean;
  };
}

interface Props {
  accountTypes?: string[];
  accountId?: number;
  transactionTypes?: string[];
  title?: string;
  onSaved?: () => void;
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TransactionsManager({
  accountTypes,
  accountId,
  transactionTypes,
  title,
  onSaved,
}: Props) {
  const { getToken } = useAuth();
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAccount, setFilterAccount] = useState<number>(0);
  const [filterType, setFilterType] = useState<string>("All");
  const [edit, setEdit] = useState<EditModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const [t, a, asts] = await Promise.all([
      api.listTransactions(token).catch(() => []),
      api.listAccounts(token).catch(() => []),
      api.listAssets(token).catch(() => []),
    ]);
    setTxns(t);
    setAccounts(a);
    setAssets(asts);
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(txn: TransactionRow) {
    setEdit({
      txn,
      form: {
        type: txn.type,
        date: txn.date.slice(0, 10),
        amount: String(txn.amount),
        units: txn.units != null ? String(txn.units) : "",
        price_per_unit: txn.price_per_unit != null ? String(txn.price_per_unit) : "",
        fees: String(txn.fees),
        notes: txn.notes ?? "",
        asset_id: txn.asset_id ?? 0,
        franking_percentage: txn.franking_percentage != null ? String(txn.franking_percentage) : "",
        is_drp: txn.is_drp ?? false,
      },
    });
    setError("");
  }

  async function handleSave() {
    if (!edit) return;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const f = edit.form;

      const requiresAsset = ["Buy", "Sell", "Dividend"].includes(f.type);

      await api.updateTransaction(token, edit.txn.id, {
        type: f.type,
        date: new Date(f.date).toISOString(),
        amount: parseFloat(f.amount),
        units: f.units ? parseFloat(f.units) : undefined,
        price_per_unit: f.price_per_unit ? parseFloat(f.price_per_unit) : undefined,
        fees: parseFloat(f.fees) || 0,
        notes: f.notes || undefined,
        account_id: edit.txn.account_id,
        asset_id: (requiresAsset && f.asset_id > 0) ? f.asset_id : undefined,
        franking_percentage: (f.type === "Dividend" && f.franking_percentage) ? parseFloat(f.franking_percentage) : undefined,
        is_drp: f.type === "Dividend" ? f.is_drp : undefined,
      });

      await load();
      if (onSaved) onSaved();
      setEdit(null);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteTransaction(token, id);
      setTxns((t) => t.filter((x) => x.id !== id));
      if (onSaved) onSaved();
    } finally {
      setDeleting(null);
    }
  }

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const assetMap = Object.fromEntries(assets.map((ast) => [ast.id, ast]));

  // Apply props-based filtering
  const displayedAccounts = accountTypes && accountTypes.length > 0
    ? accounts.filter((a) => accountTypes.includes(a.type))
    : accounts;

  const filtered = txns.filter((t) => {
    const acct = accountMap[t.account_id];
    
    // Filter by account types (prop)
    if (accountTypes && accountTypes.length > 0) {
      if (!acct || !accountTypes.includes(acct.type)) return false;
    }

    // Filter by account ID (prop)
    if (accountId !== undefined && accountId > 0) {
      if (t.account_id !== accountId) return false;
    }

    // Filter by transaction types (prop)
    if (transactionTypes && transactionTypes.length > 0) {
      if (!transactionTypes.includes(t.type)) return false;
    }

    // UI filters
    if (filterAccount && t.account_id !== filterAccount) return false;
    if (filterType !== "All" && t.type !== filterType) return false;

    return true;
  });

  if (loading) return <p className="text-sm text-slate-500 animate-pulse">Loading transactions…</p>;

  const showAssetCol = filtered.some((t) => ["Buy", "Sell", "Dividend"].includes(t.type));

  return (
    <div className="space-y-4">
      {/* Filters & Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {title && <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>}
        <div className="flex flex-wrap gap-3 text-xs">
          {/* Only show account filter if we aren't locked to a specific account ID */}
          {(!accountId || accountId <= 0) && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(parseInt(e.target.value))}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={0}>All accounts</option>
              {displayedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {/* Only show transaction type filter if not locked by props */}
          {(!transactionTypes || transactionTypes.length <= 1) && (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option>All</option>
              {TXN_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-500 self-center">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-slate-400 text-sm">No transactions found.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0 border border-slate-200 dark:border-slate-800/80">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Type</th>
                {showAssetCol && <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Asset</th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Account</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Amount</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Units</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Price</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">Fees</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.map((txn) => (
                <tr key={txn.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{fmt(txn.date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-medium ${TYPE_COLOUR[txn.type] ?? "text-slate-300"} flex items-center gap-1`}>
                      {txn.type}
                      {txn.type === "Dividend" && txn.franking_percentage != null && (
                        <span className="text-[9px] text-blue-400 border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none" title={`Franking credit percentage: ${txn.franking_percentage}%`}>
                          {txn.franking_percentage}% Fr.
                        </span>
                      )}
                      {txn.type === "Dividend" && txn.is_drp && (
                        <span className="text-[9px] text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none" title="Dividend Reinvestment Plan">
                          DRP
                        </span>
                      )}
                    </span>
                  </td>
                  {showAssetCol && (
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {txn.asset_id && assetMap[txn.asset_id] ? (
                        <span title={assetMap[txn.asset_id].name}>{assetMap[txn.asset_id].ticker}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {accountMap[txn.account_id]?.name ?? `#${txn.account_id}`}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {formatAUD(txn.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {txn.units != null ? Number(txn.units).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {txn.price_per_unit != null ? formatAUD(Number(txn.price_per_unit)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {txn.fees > 0 ? formatAUD(txn.fees) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{txn.notes ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(txn)}
                        className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(txn.id)}
                        disabled={deleting === txn.id}
                        className="text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deleting === txn.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Edit Transaction</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type</label>
                  <select
                    value={edit.form.type}
                    onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, type: e.target.value } }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {TXN_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={edit.form.date}
                    onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, date: e.target.value } }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {["Buy", "Sell", "Dividend"].includes(edit.form.type) && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Asset (Ticker) *</label>
                  <select
                    value={edit.form.asset_id}
                    onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, asset_id: parseInt(e.target.value) } }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={0}>Select asset ticker…</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.ticker} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={edit.form.amount}
                    onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, amount: e.target.value } }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Fees ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={edit.form.fees}
                    onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, fees: e.target.value } }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {(["Buy", "Sell", "Dividend"].includes(edit.form.type)) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Units</label>
                    <input
                      type="number"
                      step="0.00000001"
                      value={edit.form.units}
                      onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, units: e.target.value } }))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  {["Buy", "Sell"].includes(edit.form.type) && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Price per unit ($)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={edit.form.price_per_unit}
                        onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, price_per_unit: e.target.value } }))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {edit.form.type === "Dividend" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Franking %</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={edit.form.franking_percentage}
                      onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, franking_percentage: e.target.value } }))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex items-end pb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={edit.form.is_drp}
                        onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, is_drp: e.target.checked } }))}
                        className="w-4 h-4 rounded accent-emerald-500"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-400">Reinvested (DRP)</span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <input
                  type="text"
                  value={edit.form.notes}
                  onChange={(e) => setEdit((m) => m && ({ ...m, form: { ...m.form, notes: e.target.value } }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEdit(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
