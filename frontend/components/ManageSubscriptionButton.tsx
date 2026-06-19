"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

export default function ManageSubscriptionButton() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleManage() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/billing/create-portal-session`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        },
      );
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleManage}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "Loading…" : "Manage subscription"}
    </button>
  );
}
