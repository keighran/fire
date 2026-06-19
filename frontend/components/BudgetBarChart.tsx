"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { BudgetSummary } from "@/lib/api";

const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface Props {
  data: BudgetSummary[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", notation: "compact", maximumFractionDigits: 1 }).format(v);

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income   = payload.find((p: any) => p.dataKey === "total_income")?.value ?? 0;
  const expenses = payload.find((p: any) => p.dataKey === "total_expenses")?.value ?? 0;
  const savings  = income - expenses;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-200 mb-2">{label}</p>
      <p className="text-emerald-400">Income:   {fmt(income)}</p>
      <p className="text-red-400">  Expenses: {fmt(expenses)}</p>
      <p className={savings >= 0 ? "text-blue-400" : "text-amber-400"}>
        Net: {fmt(savings)}
      </p>
    </div>
  );
}

export default function BudgetBarChart({ data }: Props) {
  const chartData = data.map((d) => ({
    label: `${MONTH_ABBR[d.month - 1]} ${String(d.year).slice(2)}`,
    total_income: d.total_income,
    total_expenses: d.total_expenses,
  }));

  return (
    <div className="card">
      <p className="stat-label mb-4">Income vs Expenses — Last 12 Months</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} barCategoryGap="30%" barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend
            formatter={(v) => v === "total_income" ? "Income" : "Expenses"}
            wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
          />
          <Bar dataKey="total_income"   fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
          <Bar dataKey="total_expenses" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
