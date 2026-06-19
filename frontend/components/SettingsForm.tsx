"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { UserSettings } from "@/lib/api";

interface Props {
  initial: UserSettings;
}

type FieldMeta = {
  key: keyof UserSettings;
  label: string;
  type: "text" | "number" | "select" | "toggle";
  options?: string[];
  hint?: string;
  pct?: boolean;
};

const SECTIONS: { title: string; fields: FieldMeta[] }[] = [
  {
    title: "Personal & Pay",
    fields: [
      { key: "employment_salary",    label: "Annual Employment Salary ($)",  type: "number", hint: "Gross AUD salary before tax" },
      { key: "pay_frequency",        label: "Pay Frequency",                 type: "select", options: ["Weekly","Fortnightly","Twice Monthly","4-weeks","Monthly"] },
      { key: "pay_day_of_month",     label: "Pay Day of Month",              type: "number" },
      { key: "marginal_tax_rate",    label: "Marginal Tax Rate",             type: "number", pct: true, hint: "Used for CGT future liability estimates" },
    ],
  },
  {
    title: "Portfolio",
    fields: [
      { key: "default_brokerage_fee", label: "Default Brokerage Fee ($)", type: "number", hint: "Per-trade fee used as default when adding transactions" },
      { key: "cgt_method",            label: "CGT Method",                type: "select", options: ["FIFO","Manual"] },
      { key: "bank_interest_rate",    label: "Bank Interest Rate",        type: "number", pct: true },
      { key: "base_currency",         label: "Base Currency",             type: "select", options: ["AUD","USD","GBP","EUR"] },
    ],
  },
  {
    title: "Budget & Emergency Fund",
    fields: [
      { key: "use_budget",            label: "Enable Budget Tracking",   type: "toggle" },
      { key: "emergency_fund_months", label: "Emergency Fund Target (months)", type: "number", hint: "How many months of expenses to hold in cash" },
    ],
  },
  {
    title: "FIRE Assumptions",
    fields: [
      { key: "fire_target_annual_spend",    label: "Target Annual Spend ($)",    type: "number", hint: "Annual spending in retirement (today's dollars)" },
      { key: "fire_safe_withdrawal_rate",   label: "Safe Withdrawal Rate",       type: "number", pct: true, hint: "Default 4% — Trinity Study" },
      { key: "fire_investment_return_rate", label: "Investment Return Rate",     type: "number", pct: true },
      { key: "fire_inflation_rate",         label: "Inflation Rate",             type: "number", pct: true },
      { key: "fire_current_age",            label: "Current Age",               type: "number" },
      { key: "fire_target_retire_age",      label: "Target Retirement Age",     type: "number" },
      { key: "fire_life_expectancy",        label: "Life Expectancy",           type: "number" },
    ],
  },
];

export default function SettingsForm({ initial }: Props) {
  const { getToken } = useAuth();
  const [form, setForm] = useState<UserSettings>({ ...initial });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function set(key: keyof UserSettings, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/settings`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {SECTIONS.map(({ title, fields }) => (
        <div key={title} className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-800 pb-3">{title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(({ key, label, type, options, hint, pct }) => {
              const value = form[key];

              if (type === "toggle") {
                return (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <label className="text-sm text-slate-300">{label}</label>
                      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => set(key, !value)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-emerald-600" : "bg-slate-700"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                );
              }

              if (type === "select") {
                return (
                  <div key={key}>
                    <label className="block text-xs text-slate-500 mb-1">{label}</label>
                    <select
                      value={String(value ?? "")}
                      onChange={(e) => set(key, e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      {options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
                  </div>
                );
              }

              const numVal = pct ? Number(value) * 100 : Number(value ?? 0);
              return (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1">
                    {label} {pct ? "(%)": ""}
                  </label>
                  <input
                    type="number"
                    step={pct ? "0.1" : key.includes("age") || key.includes("months") || key.includes("day") ? "1" : "0.01"}
                    value={value === null || value === undefined ? "" : pct ? numVal.toFixed(pct ? 1 : 2) : String(value)}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      set(key, isNaN(raw) ? null : pct ? raw / 100 : raw);
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status === "saving"}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {status === "saving" ? "Saving…" : "Save settings"}
        </button>
        {status === "saved"  && <span className="text-emerald-400 text-sm">✓ Saved</span>}
        {status === "error"  && <span className="text-red-400 text-sm">Save failed — please try again</span>}
      </div>
    </form>
  );
}
