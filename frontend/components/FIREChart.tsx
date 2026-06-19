"use client";

import { FIRETrajectoryRow } from "@/lib/api";
import { formatAUD } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  trajectory: FIRETrajectoryRow[];
  fireNumber: number;
}

export default function FIREChart({ trajectory, fireNumber }: Props) {
  if (trajectory.length === 0) {
    return (
      <div className="card">
        <p className="stat-label mb-3">Projection Timeline</p>
        <p className="text-slate-500 text-sm text-center py-10">No projection data available.</p>
      </div>
    );
  }

  const data = trajectory.map(r => ({
    year: r.calendar_year,
    "Net Worth": r.projected_net_worth,
    phase: r.phase,
  }));

  return (
    <div className="card">
      <p className="stat-label mb-3">Projection Timeline</p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => formatAUD(v, true)}
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatAUD(value), name]}
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
          />
          <ReferenceLine
            y={fireNumber}
            stroke="#f59e0b"
            strokeDasharray="6 3"
            label={{ value: "FIRE Number", fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }}
          />
          <Line
            type="monotone"
            dataKey="Net Worth"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Legend
            formatter={(value) => <span className="text-xs text-slate-400">{value}</span>}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-600 mt-2">
        Accumulation phase: contributions + compound growth. Drawdown phase: portfolio funding target spend.
        Effective rate = nominal return − inflation.
      </p>
    </div>
  );
}
