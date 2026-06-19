"use client";

import { MonthlySnapshot } from "@/lib/api";
import { formatAUD } from "@/lib/format";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props { data: MonthlySnapshot[] }

export default function NetWorthHistoryChart({ data }: Props) {
  const sorted = [...data].sort(
    (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
  );

  const chartData = sorted.map(s => ({
    month: new Date(s.snapshot_date).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
    "Net Worth": s.net_worth,
    Assets: s.total_assets,
    Liabilities: s.total_liabilities,
  }));

  return (
    <div className="card h-full">
      <p className="stat-label mb-3">Net Worth History</p>
      {chartData.length === 0 ? (
        <p className="text-slate-500 text-sm mt-8 text-center">
          No history yet — take your first monthly snapshot.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatAUD(v, true)}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatAUD(value), name]}
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Area
              type="monotone"
              dataKey="Net Worth"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#nwGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
