"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const ADMIN_EMAIL = "admin@astradigital.com.au";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  total_users: number;
  total_transactions: number;
  total_accounts: number;
  users_by_tier: Record<string, number>;
}

interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
  tier: string;
  sub_status: string | null;
  stripe_customer_id: string | null;
  transaction_count: number;
  account_count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_COLOURS: Record<string, string> = {
  Free:       "bg-slate-700 text-slate-300",
  Pro:        "bg-emerald-900 text-emerald-300",
  Enterprise: "bg-violet-900 text-violet-300",
};

const TIERS = ["Free", "Pro", "Enterprise"];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { getToken } = useAuth();
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const [stats, setStats]     = useState<Stats | null>(null);
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [actionMsg, setActionMsg] = useState("");

  // Guard — redirect non-admins immediately once Clerk loads.
  useEffect(() => {
    if (isLoaded && user?.primaryEmailAddress?.emailAddress !== ADMIN_EMAIL) {
      router.replace("/");
    }
  }, [isLoaded, user, router]);

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

      const [statsRes, usersRes] = await Promise.all([
        fetch(`${BASE}/api/admin/stats`, { headers }),
        fetch(`${BASE}/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`, { headers }),
      ]);

      if (!statsRes.ok || !usersRes.ok) throw new Error("Failed to load admin data");

      setStats(await statsRes.json());
      setUsers(await usersRes.json());
      setError("");
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getToken, search]);

  useEffect(() => {
    if (isLoaded && user?.primaryEmailAddress?.emailAddress === ADMIN_EMAIL) {
      fetchData();
    }
  }, [isLoaded, user, fetchData]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(""), 3000);
  };

  const setTier = async (userId: number, tier: string) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/admin/users/${userId}/tier`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    if (res.ok) { flash(`Tier updated to ${tier}`); fetchData(); }
    else flash("Failed to update tier");
  };

  const toggleActive = async (userId: number, currentlyActive: boolean) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/admin/users/${userId}/active`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { flash(currentlyActive ? "User suspended" : "User reactivated"); fetchData(); }
    else flash("Failed to update user");
  };

  const deleteUser = async (userId: number, email: string) => {
    if (!confirm(`Permanently delete ${email} and all their data? This cannot be undone.`)) return;
    const token = await getToken();
    const res = await fetch(`${BASE}/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { flash("User deleted"); fetchData(); }
    else flash("Failed to delete user");
  };

  if (!isLoaded || (isLoaded && user?.primaryEmailAddress?.emailAddress !== ADMIN_EMAIL)) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Admin Panel</h1>
          <p className="text-sm text-slate-500 mt-0.5">WealthTrack AU — SaaS Management</p>
        </div>
        <button
          onClick={fetchData}
          className="text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600
            px-3 py-1.5 rounded-lg transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Flash message */}
      {actionMsg && (
        <div className="bg-emerald-950 border border-emerald-800 text-emerald-300 text-sm px-4 py-2.5 rounded-lg">
          {actionMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-950 border border-red-900 text-red-400 text-sm px-4 py-2.5 rounded-lg">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={stats.total_users} />
          <StatCard label="Transactions" value={stats.total_transactions.toLocaleString()} />
          <StatCard label="Accounts" value={stats.total_accounts.toLocaleString()} />
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Users by Tier</p>
            <div className="flex flex-col gap-1.5">
              {Object.entries(stats.users_by_tier).map(([tier, count]) => (
                <div key={tier} className="flex items-center justify-between">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${TIER_COLOURS[tier] ?? "bg-slate-700 text-slate-300"}`}>
                    {tier}
                  </span>
                  <span className="text-sm font-semibold text-slate-200">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 gap-4">
          <h2 className="text-sm font-semibold text-slate-200">Users</h2>
          <input
            type="search"
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200
              placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-600 w-64"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="text-center px-4 py-3 font-medium">Tier</th>
                  <th className="text-center px-4 py-3 font-medium">Txns</th>
                  <th className="text-center px-4 py-3 font-medium">Accounts</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className={`hover:bg-slate-800/30 transition-colors ${!u.is_active ? "opacity-50" : ""}`}>
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200 truncate max-w-[200px]">{u.email}</div>
                      <div className="text-xs text-slate-500 truncate">{u.display_name}</div>
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>

                    {/* Tier selector */}
                    <td className="px-4 py-3 text-center">
                      <select
                        value={u.tier}
                        onChange={(e) => setTier(u.id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600
                          ${TIER_COLOURS[u.tier] ?? "bg-slate-700 text-slate-300"}`}
                      >
                        {TIERS.map((t) => (
                          <option key={t} value={t} className="bg-slate-800 text-slate-200">{t}</option>
                        ))}
                      </select>
                    </td>

                    {/* Transaction count */}
                    <td className="px-4 py-3 text-center text-slate-400">{u.transaction_count}</td>

                    {/* Account count */}
                    <td className="px-4 py-3 text-center text-slate-400">{u.account_count}</td>

                    {/* Active status */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                        ${u.is_active ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
                        {u.is_active ? "Active" : "Suspended"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleActive(u.id, u.is_active)}
                          className={`text-xs px-2.5 py-1 rounded border transition-colors
                            ${u.is_active
                              ? "border-yellow-800 text-yellow-500 hover:bg-yellow-950"
                              : "border-emerald-800 text-emerald-500 hover:bg-emerald-950"
                            }`}
                        >
                          {u.is_active ? "Suspend" : "Reactivate"}
                        </button>
                        <button
                          onClick={() => deleteUser(u.id, u.email)}
                          className="text-xs px-2.5 py-1 rounded border border-red-900 text-red-500
                            hover:bg-red-950 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-600 text-center pb-4">
        Admin access — {ADMIN_EMAIL} only. Changes take effect immediately.
      </p>
    </div>
  );
}
