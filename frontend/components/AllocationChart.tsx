"use client";

import { NetWorthSnapshot } from "@/lib/api";
import { formatAUD } from "@/lib/format";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLOURS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899"];

interface Props { snapshot: NetWorthSnapshot | null }

export default function AllocationChart({ snapshot }: Props) {
  if (!snapshot) return null;

  const data = [
    { name: "ETFs",          value: snapshot.etf_value },
    { name: "Shares",        value: snapshot.shares_value },
    { name: "Managed Funds", value: snapshot.managed_fund_value },
    { name: "Crypto",        value: snapshot.crypto_value },
    { name: "Cash",          value: snapshot.cash_value },
    { name: "Super",         value: snapshot.super_value },
    { name: "Property",      value: snapshot.property_value },
  ].filter(d => d.value > 0);

  return (
    <div className="card h-full">
      <p className="stat-label mb-3">Asset Allocation</p>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLOURS[i % COLOURS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatAUD(value)}
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-slate-400">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
