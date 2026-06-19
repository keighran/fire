"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, Account, TransactionCreatePayload } from "@/lib/api";

const TXN_TYPES = ["Buy", "Sell", "Deposit", "Withdrawal", "Dividend", "Interest", "Expense", "Income"] as const;

interface Props {
  onClose: () => void;
  onSaved: () => void;
  defaultAccountId?: number;
}

const BLANK = {
  account_id: 0,
  type: "Deposit" as string,
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  units: "",
  price_per_unit: "",
  fees: "",
  notes: "",
};

export default function AddTransactionModal({ onClose, onSaved, defaultAccountId }: Props) {
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ ...BLANK, account_id: defaultAccountId ?? 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const all = await api.listAccounts(token).catch(() => []);
    setAccounts(all);
    if (!defaultAccountId && all.length > 0) {
      setForm((f) => ({ ...f, account_id: all[0].id }));
    }
  }, [getToken, defaultAccountId]);

  useEffect(() => { load(); }, [load]);

  const isEquity = ["Buy", "Sell"].includes(form.type);
  const isDividend = form.type === "Dividend";

  async function handleSave() {
    if (!form.account_id) { setError("Select an account."); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Amount must be greater than 0."); return; }

    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const payload: TransactionCreatePayload = {
        account_id: form.account_id,
        type: form.type,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(form.amount),
        fees: parseFloat(form.fees) || 0,
        notes: form.notes || undefined,
      };
      if ((isEquity || isDividend) && form.units) payload.units = parseFloat(form.units);
      if (isEquity && form.price_per_unit) payload.price_per_unit = parseFloat(form.price_per_unit);

      await api.createTransaction(token, payload);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Add Transaction</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Account *</label>
            <select
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: parseInt(e.target.value) }))}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={0}>Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TXN_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fees ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.fees}
                onChange={(e) => setForm((f) => ({ ...f, fees: e.target.value }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {(isEquity || isDividend) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Units</label>
                <input
                  type="number"
                  step="0.00000001"
                  min="0"
                  placeholder="100"
                  value={form.units}
                  onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {isEquity && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Price per unit ($)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="95.40"
                    value={form.price_per_unit}
                    onChange={(e) => setForm((f) => ({ ...f, price_per_unit: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <input
              type="text"
              placeholder="Optional"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Add Transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
