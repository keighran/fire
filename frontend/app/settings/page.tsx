"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { api, UserSettings } from "@/lib/api";
import SettingsForm from "@/components/SettingsForm";
import AccountsManager from "@/components/AccountsManager";

type Tab = "settings" | "accounts";

export default function SettingsPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<Tab>("settings");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken().then(async (token) => {
      if (!token) return;
      const s = await api.getSettings(token).catch(() => null);
      setSettings(s);
      setLoading(false);
    });
  }, [getToken]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your portfolio assumptions, accounts, and FIRE projections.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-lg w-fit">
        {(["settings", "accounts"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 animate-pulse">Loading…</p>
      ) : tab === "settings" ? (
        settings ? (
          <SettingsForm initial={settings} />
        ) : (
          <div className="card text-center py-10">
            <p className="text-slate-400 mb-2">Could not load settings.</p>
            <p className="text-sm text-slate-600">Ensure the backend is running and you are signed in.</p>
          </div>
        )
      ) : (
        <AccountsManager />
      )}
    </div>
  );
}
