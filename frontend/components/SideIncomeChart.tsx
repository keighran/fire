"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { SideIncomeMonth } from "@/lib/api";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", notation: "compact", maximumFractionDigits: 1 }).format(v);

interface Props {
  data: SideIncomeMonth[];
  rollingAvg: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm shadow-xl">
      <p className="font-semibold text-slate-200 mb-1">{label}</p>
      <p className="text-violet-400">Income: {fmt(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export default function SideIncomeChart({ data, rollingAvg }: Props) {
  const chartData = data.slice(-18).map((d) => ({
    label: d.month,
    amount: d.amount,
  }));

  return (
    <div className="card">
      <p className="stat-label mb-4">Monthly Side Income</p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          {rollingAvg > 0 && (
            <ReferenceLine
              y={rollingAvg}
              stroke="#a78bfa"
              strokeDasharray="4 4"
              label={{ value: "365-day avg", position: "insideTopRight", fill: "#a78bfa", fontSize: 11 }}
            />
          )}
          <Bar dataKey="amount" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
