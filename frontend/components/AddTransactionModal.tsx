"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, Account, Asset, TransactionCreatePayload } from "@/lib/api";

const TXN_TYPES = ["Buy", "Sell", "Deposit", "Withdrawal", "Dividend", "Interest", "Expense", "Income"] as const;
const ASSET_CLASSES = ["ETF", "Stock", "Managed Fund", "Crypto", "Cash", "Property", "Other"] as const;
const ACCOUNT_TYPES = ["Cash", "Brokerage", "Super", "Crypto", "Property", "Liability", "Other Asset"] as const;

interface Props {
  onClose: () => void;
  onSaved: () => void;
  defaultAccountId?: number;
  defaultType?: string;
  allowedAccountTypes?: string[];
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
  asset_id: 0,
  franking_percentage: "",
  is_drp: false,
};

const BLANK_NEW_ASSET = {
  ticker: "",
  name: "",
  category: "Brokerage",
  asset_class: "ETF",
};

export default function AddTransactionModal({
  onClose,
  onSaved,
  defaultAccountId,
  defaultType,
  allowedAccountTypes,
}: Props) {
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({
    ...BLANK,
    account_id: defaultAccountId ?? 0,
    type: defaultType ?? "Deposit",
  });
  const [newAsset, setNewAsset] = useState({ ...BLANK_NEW_ASSET });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const [allAccounts, allAssets] = await Promise.all([
      api.listAccounts(token).catch(() => []),
      api.listAssets(token).catch(() => []),
    ]);

    setAccounts(allAccounts);
    setAssets(allAssets);

    // Get accounts matching filters
    const filteredAccts = allowedAccountTypes
      ? allAccounts.filter((a) => allowedAccountTypes.includes(a.type))
      : allAccounts;

    if (!defaultAccountId && filteredAccts.length > 0) {
      setForm((f) => ({
        ...f,
        account_id: filteredAccts[0].id,
        // Set new asset category based on account type if possible
        category: filteredAccts[0].type,
      }));
      setNewAsset((na) => ({ ...na, category: filteredAccts[0].type }));
    } else if (defaultAccountId) {
      const matched = allAccounts.find((a) => a.id === defaultAccountId);
      if (matched) {
        setNewAsset((na) => ({ ...na, category: matched.type }));
      }
    }
  }, [getToken, defaultAccountId, allowedAccountTypes]);

  useEffect(() => {
    load();
  }, [load]);

  // Dynamically set category of new asset if account changes
  useEffect(() => {
    const selectedAcc = accounts.find((a) => a.id === form.account_id);
    if (selectedAcc) {
      setNewAsset((na) => ({ ...na, category: selectedAcc.type }));
    }
  }, [form.account_id, accounts]);

  const isEquity = ["Buy", "Sell"].includes(form.type);
  const isDividend = form.type === "Dividend";
  const requiresAsset = isEquity || isDividend;

  const displayedAccounts = allowedAccountTypes
    ? accounts.filter((a) => allowedAccountTypes.includes(a.type))
    : accounts;

  async function handleSave() {
    if (!form.account_id) {
      setError("Select an account.");
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      let selectedAssetId: number | undefined = undefined;

      if (requiresAsset) {
        if (form.asset_id === -1) {
          // Create new asset inline
          if (!newAsset.ticker.trim() || !newAsset.name.trim()) {
            throw new Error("Asset Ticker and Name are required.");
          }
          const created = await api.createAsset(token, {
            ticker: newAsset.ticker.trim().toUpperCase(),
            name: newAsset.name.trim(),
            category: newAsset.category,
            asset_class: newAsset.asset_class,
          });
          selectedAssetId = created.id;
        } else if (form.asset_id > 0) {
          selectedAssetId = form.asset_id;
        } else {
          throw new Error("Please select an asset or create a new one.");
        }
      }

      const payload: TransactionCreatePayload = {
        account_id: form.account_id,
        type: form.type,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(form.amount),
        fees: parseFloat(form.fees) || 0,
        notes: form.notes || undefined,
      };

      if (selectedAssetId !== undefined) {
        payload.asset_id = selectedAssetId;
      }

      if ((isEquity || isDividend) && form.units) {
        payload.units = parseFloat(form.units);
      }
      if (isEquity && form.price_per_unit) {
        payload.price_per_unit = parseFloat(form.price_per_unit);
      }
      if (isDividend) {
        if (form.franking_percentage) {
          payload.franking_percentage = parseFloat(form.franking_percentage);
        }
        payload.is_drp = form.is_drp;
      }

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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add Transaction</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Account *</label>
            <select
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: parseInt(e.target.value) }))}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={0}>Select account…</option>
              {displayedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, asset_id: 0 }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TXN_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
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

          {requiresAsset && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Asset (Ticker) *</label>
              <select
                value={form.asset_id}
                onChange={(e) => setForm((f) => ({ ...f, asset_id: parseInt(e.target.value) }))}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value={0}>Select asset ticker…</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.ticker} — {a.name} ({a.asset_class})
                  </option>
                ))}
                <option value={-1}>+ Create New Asset…</option>
              </select>
            </div>
          )}

          {requiresAsset && form.asset_id === -1 && (
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2 mt-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">New Asset Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Ticker *</label>
                  <input
                    type="text"
                    placeholder="e.g. VAS.AX"
                    value={newAsset.ticker}
                    onChange={(e) => setNewAsset((na) => ({ ...na, ticker: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Asset Class *</label>
                  <select
                    value={newAsset.asset_class}
                    onChange={(e) => setNewAsset((na) => ({ ...na, asset_class: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    {ASSET_CLASSES.map((ac) => (
                      <option key={ac}>{ac}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Vanguard Aus Shares ETF"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset((na) => ({ ...na, name: e.target.value }))}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-0.5">Category *</label>
                  <select
                    value={newAsset.category}
                    onChange={(e) => setNewAsset((na) => ({ ...na, category: e.target.value }))}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    {ACCOUNT_TYPES.map((act) => (
                      <option key={act}>{act}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

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

          {isDividend && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Franking %</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  placeholder="e.g. 100"
                  value={form.franking_percentage}
                  onChange={(e) => setForm((f) => ({ ...f, franking_percentage: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-end pb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_drp}
                    onChange={(e) => setForm((f) => ({ ...f, is_drp: e.target.checked }))}
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
