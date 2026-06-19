"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { api, Account, AccountCreatePayload } from "@/lib/api";

const ACCOUNT_TYPES = ["Cash", "Brokerage", "Super", "Crypto", "Property", "Liability", "Other Asset"] as const;
type AccountType = typeof ACCOUNT_TYPES[number];

const TYPE_COLOURS: Record<AccountType, string> = {
  Cash:          "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Brokerage:     "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Super:         "bg-violet-500/20 text-violet-400 border-violet-500/30",
  Crypto:        "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Property:      "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Liability:     "bg-red-500/20 text-red-400 border-red-500/30",
  "Other Asset": "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

interface ModalState {
  mode: "add" | "edit";
  account?: Account;
  type: AccountType;
}

const BLANK: Omit<AccountCreatePayload, "type"> = {
  name: "", institution: "", currency: "AUD", is_retirement: false, notes: "",
};

export default function AccountsManager() {
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      setAccounts(await api.listAccounts(token));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  function openAdd(type: AccountType) {
    setForm({ ...BLANK, is_retirement: type === "Super" });
    setModal({ mode: "add", type });
    setError("");
  }

  function openEdit(account: Account) {
    setForm({
      name: account.name,
      institution: account.institution,
      currency: account.currency,
      is_retirement: account.is_retirement,
      notes: account.notes ?? "",
    });
    setModal({ mode: "edit", account, type: account.type as AccountType });
    setError("");
  }

  async function handleSave() {
    if (!modal || !form.name.trim()) { setError("Account name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      if (modal.mode === "add") {
        await api.createAccount(token, { ...form, type: modal.type });
      } else if (modal.account) {
        await api.updateAccount(token, modal.account.id, form);
      }
      await load();
      setModal(null);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this account and all its transactions? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteAccount(token, id);
      setAccounts((a) => a.filter((x) => x.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  const grouped = ACCOUNT_TYPES.reduce<Record<AccountType, Account[]>>((acc, t) => {
    acc[t] = accounts.filter((a) => a.type === t);
    return acc;
  }, {} as Record<AccountType, Account[]>);

  if (loading) return <p className="text-sm text-slate-500 animate-pulse">Loading accounts…</p>;

  return (
    <div className="space-y-6">
      {ACCOUNT_TYPES.map((type) => (
        <div key={type} className="card space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${TYPE_COLOURS[type]}`}>{type}</span>
              <span className="text-xs text-slate-500">{grouped[type].length} account{grouped[type].length !== 1 ? "s" : ""}</span>
            </div>
            <button
              onClick={() => openAdd(type)}
              className="text-xs text-emerald-500 hover:text-emerald-400 font-medium transition-colors flex items-center gap-1"
            >
              <span className="text-base leading-none">+</span> Add
            </button>
          </div>

          {grouped[type].length === 0 ? (
            <p className="text-xs text-slate-500 italic py-1">No {type.toLowerCase()} accounts yet.</p>
          ) : (
            <div className="space-y-2">
              {grouped[type].map((acc) => (
                <div key={acc.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{acc.name}</p>
                    <p className="text-xs text-slate-500 truncate">{acc.institution || "—"} · {acc.currency}{acc.is_retirement ? " · Retirement" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(acc)}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(acc.id)}
                      disabled={deleting === acc.id}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      {deleting === acc.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {modal.mode === "add" ? `Add ${modal.type} Account` : `Edit Account`}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Account Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder={modal.type === "Cash" ? "Everyday Account" : modal.type === "Brokerage" ? "CommSec" : "My Super"}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Institution</label>
                <input
                  value={form.institution}
                  onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="CommBank, ANZ, etc."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {["AUD", "USD", "NZD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_retirement}
                      onChange={(e) => setForm((f) => ({ ...f, is_retirement: e.target.checked }))}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400">Retirement / Super</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Optional notes"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
